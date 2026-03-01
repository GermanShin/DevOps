import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as iam from "aws-cdk-lib/aws-iam";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { Construct } from "constructs";

interface SharedAccountStackProps extends cdk.StackProps {
  devVpcCidr: string;
}

export class SharedAccountStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SharedAccountStackProps) {
    super(scope, id, props);

    // --- VPC for Shared Account ---
    const vpc = new ec2.Vpc(this, "SharedVpc", {
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "Private",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // --- Security Group for CodeBuild ---
    const codeBuildSg = new ec2.SecurityGroup(this, "CodeBuildSg", {
      vpc,
      description: "Security group for CodeBuild TCP check",
      allowAllOutbound: false,
    });

    // Allow outbound TCP to dev account RDS only
    codeBuildSg.addEgressRule(
      ec2.Peer.ipv4(props.devVpcCidr),
      ec2.Port.tcp(5432),
      "Allow outbound to dev account RDS"
    );

    // --- IAM Role for CodeBuild (least privilege) ---
    const codeBuildRole = new iam.Role(this, "CodeBuildRole", {
      assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
      description: "Role for DS TCP check CodeBuild project",
    });

    // Allow reading SSM parameters from dev account
    codeBuildRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ssm:GetParameter", "ssm:GetParameters"],
        resources: [
          `arn:aws:ssm:ap-southeast-2:${props.env?.account}:parameter/ds/dev/*`,
        ],
      })
    );

    // Allow CloudWatch Logs
    codeBuildRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        resources: ["*"],
      })
    );

    // Allow VPC access for CodeBuild
    codeBuildRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface",
          "ec2:DescribeSubnets",
          "ec2:DescribeSecurityGroups",
          "ec2:DescribeVpcs",
        ],
        resources: ["*"],
      })
    );

    // --- CodeBuild Project ---
    const tcpCheckProject = new codebuild.Project(this, "TcpCheckProject", {
      projectName: "ds-tcp-check",
      role: codeBuildRole,
      vpc,
      securityGroups: [codeBuildSg],
      subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: {
        buildImage: codebuild.WindowsBuildImage.WIN_SERVER_CORE_2019_BASE_3_0,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          build: {
            commands: [
              // Fetch DB endpoint from SSM
              '$DB_HOST = (Get-SSMParameter -Name "/ds/dev/db-endpoint" -WithDecryption $false).Value',
              '$DB_PORT = (Get-SSMParameter -Name "/ds/dev/db-port" -WithDecryption $false).Value',
              // TCP Connection check
              'Write-Host "Checking TCP connection to $DB_HOST:$DB_PORT"',
              "$tcp = New-Object System.Net.Sockets.TcpClient",
              "try {",
              "  $tcp.Connect($DB_HOST, [int]$DB_PORT)",
              "  if ($tcp.Connected) {",
              '    Write-Host "SUCCESS: TCP Connection established to $DB_HOST:$DB_PORT"',
              "    $tcp.Close()",
              "  }",
              "} catch {",
              '  Write-Host "FAILED: TCP Connection failed to $DB_HOST:$DB_PORT - $_"',
              "  exit 1",
              "}",
            ],
          },
        },
      }),
    });

    // --- EventBridge Rule: Every Tuesday at 9:00 AM UTC ---
    const scheduledRule = new events.Rule(this, "TuesdaySchedule", {
      ruleName: "ds-tcp-check-tuesday",
      schedule: events.Schedule.cron({
        minute: "0",
        hour: "9",
        weekDay: "TUE",
      }),
    });

    scheduledRule.addTarget(new targets.CodeBuildProject(tcpCheckProject));

    // --- Outputs ---
    new cdk.CfnOutput(this, "SharedVpcId", { value: vpc.vpcId });
    new cdk.CfnOutput(this, "CodeBuildProjectName", {
      value: tcpCheckProject.projectName,
    });
  }
}

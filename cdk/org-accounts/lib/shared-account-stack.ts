import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as iam from "aws-cdk-lib/aws-iam";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { Construct } from "constructs";

interface SharedAccountStackProps extends cdk.StackProps {
  devVpcCidr: string;
  devAccountId: string;
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

    // Allow outbound TCP to dev account EC2/RDS only
    codeBuildSg.addEgressRule(
      ec2.Peer.ipv4(props.devVpcCidr),
      ec2.Port.tcp(5432),
      "Allow outbound to dev account target"
    );

    // --- IAM Role for CodeBuild (least privilege) ---
    const codeBuildRole = new iam.Role(this, "CodeBuildRole", {
      assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
      description: "Role for DS TCP check CodeBuild project",
    });

    // Allow reading SSM parameters
    codeBuildRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ssm:GetParameter", "ssm:GetParameters"],
        resources: [
          `arn:aws:ssm:ap-southeast-2:${props.devAccountId}:parameter/ds/dev/*`,
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

    // --- CodeBuild Project (Linux) ---
    const tcpCheckProject = new codebuild.Project(this, "TcpCheckProject", {
      projectName: "ds-tcp-check",
      role: codeBuildRole,
      vpc,
      securityGroups: [codeBuildSg],
      subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0, // Linux
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          install: {
            commands: [
              // Install postgresql client for psql
              "apt-get update -y",
              "apt-get install -y postgresql-client netcat-openbsd",
            ],
          },
          build: {
            commands: [
              // Fetch target host and port from SSM
              "export TARGET_HOST=$(aws ssm get-parameter --name /ds/dev/target-host --query Parameter.Value --output text --region ap-southeast-2)",
              "export TARGET_PORT=$(aws ssm get-parameter --name /ds/dev/target-port --query Parameter.Value --output text --region ap-southeast-2)",

              // Step 1: TCP connectivity check using netcat
              'echo "=== Step 1: TCP Connectivity Check ==="',
              'nc -zv $TARGET_HOST $TARGET_PORT -w 5 && echo "SUCCESS: TCP connection to $TARGET_HOST:$TARGET_PORT" || (echo "FAILED: TCP connection to $TARGET_HOST:$TARGET_PORT" && exit 1)',

              // Step 2: PSQL connection check (Phase 2 - uncomment when RDS is added)
              // 'echo "=== Step 2: PSQL Connection Check ==="',
              // 'export DB_USER=$(aws secretsmanager get-secret-value --secret-id /ds/dev/db-credentials --query SecretString --output text | python3 -c "import sys,json; print(json.load(sys.stdin)[\"username\"])")',
              // 'export DB_PASS=$(aws secretsmanager get-secret-value --secret-id /ds/dev/db-credentials --query SecretString --output text | python3 -c "import sys,json; print(json.load(sys.stdin)[\"password\"])")',
              // 'PGPASSWORD=$DB_PASS psql -h $TARGET_HOST -p $TARGET_PORT -U $DB_USER -d dsdevdb -c "SELECT version();"',
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

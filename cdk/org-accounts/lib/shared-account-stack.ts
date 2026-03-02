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
  devVpcId: string;
  devPeeringRoleArn: string;
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

    codeBuildRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ssm:GetParameter", "ssm:GetParameters"],
        resources: [
          `arn:aws:ssm:ap-southeast-2:${props.devAccountId}:parameter/ds/dev/*`,
        ],
      })
    );

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

    // --- CodeBuild Project (Linux, private subnet) ---
    const tcpCheckProject = new codebuild.Project(this, "TcpCheckProject", {
      projectName: "ds-tcp-check",
      role: codeBuildRole,
      vpc,
      securityGroups: [codeBuildSg],
      subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          build: {
            commands: [
              "export TARGET_HOST=$(aws ssm get-parameter --name /ds/dev/target-host --query Parameter.Value --output text --region ap-southeast-2)",
              "export TARGET_PORT=$(aws ssm get-parameter --name /ds/dev/target-port --query Parameter.Value --output text --region ap-southeast-2)",
              'echo "=== Step 1: TCP Connectivity Check ==="',
              'nc -zv $TARGET_HOST $TARGET_PORT -w 5 && echo "SUCCESS: TCP connection to $TARGET_HOST:$TARGET_PORT" || (echo "FAILED: TCP connection to $TARGET_HOST:$TARGET_PORT" && exit 1)',
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

    // --- VPC Peering: Initiate from shared account to dev account ---
    const peeringConnection = new ec2.CfnVPCPeeringConnection(
      this,
      "VpcPeeringConnection",
      {
        vpcId: vpc.vpcId,
        peerVpcId: props.devVpcId,
        peerOwnerId: props.devAccountId,
        peerRegion: "ap-southeast-2",
        peerRoleArn: props.devPeeringRoleArn,
        tags: [{ key: "Name", value: "ds-shared-to-dev-peering" }],
      }
    );

    // --- Add routes to dev account VPC using explicit route table IDs ---
    const sharedPrivateRouteTables = [
      "rtb-03564729ca129ef09",
      "rtb-037f48220157a1ce0",
    ];

    sharedPrivateRouteTables.forEach((routeTableId, index) => {
      new ec2.CfnRoute(this, `PeeringRouteToDev${index}`, {
        routeTableId: routeTableId,
        destinationCidrBlock: props.devVpcCidr, // 10.1.0.0/16
        vpcPeeringConnectionId: peeringConnection.ref,
      });
    });

    // --- Outputs ---
    new cdk.CfnOutput(this, "SharedVpcId", { value: vpc.vpcId });
    new cdk.CfnOutput(this, "CodeBuildProjectName", {
      value: tcpCheckProject.projectName,
    });
    new cdk.CfnOutput(this, "PeeringConnectionId", {
      value: peeringConnection.ref,
      exportName: "PeeringConnectionId",
    });
  }
}

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export class DevAccountStack extends cdk.Stack {
  public readonly vpcCidr: string = "10.1.0.0/16";
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- VPC (private subnets only, no NAT Gateway) ---
    const vpc = new ec2.Vpc(this, "DevVpc", {
      ipAddresses: ec2.IpAddresses.cidr(this.vpcCidr),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC, // <--- Add this so SSM works!
          cidrMask: 24,
        },
        {
          name: "Private",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    this.vpc = vpc;

    // --- Security Group for EC2 ---
    const instanceSecurityGroup = new ec2.SecurityGroup(
      this,
      "InstanceSecurityGroup",
      {
        vpc,
        description: "Allow TCP from shared account only",
        allowAllOutbound: false,
      }
    );

    instanceSecurityGroup.addIngressRule(
      ec2.Peer.ipv4("10.0.0.0/16"),
      ec2.Port.tcp(5432),
      "Allow TCP from shared account"
    );

    // 2. ADD THIS: Allow the EC2 to reply back to Account 1
    instanceSecurityGroup.addEgressRule(
      ec2.Peer.ipv4("10.0.0.0/16"), // Account 1 CIDR
      ec2.Port.allTcp(),
      "Allow TCP Outbound response to shared account"
    );

    // 1. Existing rule for the Public SSM API
    instanceSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "Allow outbound HTTPS for SSM Agent check-in"
    );

    // 2. NEW: Rule for the internal Metadata Service (Required for IAM Credentials)
    instanceSecurityGroup.addEgressRule(
      ec2.Peer.ipv4("169.254.169.254/32"),
      ec2.Port.tcp(80),
      "Allow access to internal instance metadata service"
    );

    // --- EC2 Instance (free tier t2.micro) ---
    const instance = new ec2.Instance(this, "DevInstance", {
      instanceName: "ds-dev-instance",
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2(),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: instanceSecurityGroup,
      associatePublicIpAddress: true,
    });

    // Grant the EC2 permission to use Systems Manager (SSM)
    instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    );

    // --- IAM Role for VPC Peering ---
    const vpcPeeringRole = new iam.Role(this, "VpcPeeringRole", {
      roleName: "ds-vpc-peering-role",
      assumedBy: new iam.AccountPrincipal("890336468788"),
      description: "Allows shared account to create VPC peering connection",
    });

    vpcPeeringRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ec2:AcceptVpcPeeringConnection",
          "ec2:CreateVpcPeeringConnection",
          "ec2:DescribeVpcPeeringConnections",
        ],
        resources: ["*"],
      })
    );

    // --- IAM Role for Start/Stop Lambda ---
    const lambdaRole = new iam.Role(this, "InstanceSchedulerRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: "Role for EC2 start/stop Lambda",
    });

    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ec2:StartInstances",
          "ec2:StopInstances",
          "ec2:DescribeInstances",
        ],
        resources: [
          `arn:aws:ec2:ap-southeast-2:${this.account}:instance/${instance.instanceId}`,
        ],
      })
    );

    lambdaRole.addToPolicy(
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

    // --- Lambda: Start EC2 ---
    const startInstanceLambda = new lambda.Function(
      this,
      "StartInstanceLambda",
      {
        functionName: "ds-start-instance",
        runtime: lambda.Runtime.PYTHON_3_12,
        handler: "index.handler",
        role: lambdaRole,
        timeout: cdk.Duration.seconds(30),
        environment: {
          INSTANCE_ID: instance.instanceId,
        },
        code: lambda.Code.fromInline(`
import boto3
import os

def handler(event, context):
    ec2 = boto3.client('ec2', region_name='ap-southeast-2')
    instance_id = os.environ['INSTANCE_ID']
    try:
        ec2.start_instances(InstanceIds=[instance_id])
        print(f"Successfully started EC2 instance: {instance_id}")
    except Exception as e:
        print(f"Error starting EC2: {e}")
        raise
        `),
      }
    );

    // --- Lambda: Stop EC2 ---
    const stopInstanceLambda = new lambda.Function(this, "StopInstanceLambda", {
      functionName: "ds-stop-instance",
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "index.handler",
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      environment: {
        INSTANCE_ID: instance.instanceId,
      },
      code: lambda.Code.fromInline(`
import boto3
import os

def handler(event, context):
    ec2 = boto3.client('ec2', region_name='ap-southeast-2')
    instance_id = os.environ['INSTANCE_ID']
    try:
        ec2.stop_instances(InstanceIds=[instance_id])
        print(f"Successfully stopped EC2 instance: {instance_id}")
    except Exception as e:
        print(f"Error stopping EC2: {e}")
        raise
        `),
    });

    // --- EventBridge: Start EC2 at 8:50 AM UTC every Tuesday ---
    const startRule = new events.Rule(this, "StartInstanceRule", {
      ruleName: "ds-start-instance-tuesday",
      schedule: events.Schedule.cron({
        minute: "50",
        hour: "8",
        weekDay: "TUE",
      }),
    });
    startRule.addTarget(new targets.LambdaFunction(startInstanceLambda));

    // --- EventBridge: Stop EC2 at 9:30 AM UTC every Tuesday ---
    const stopRule = new events.Rule(this, "StopInstanceRule", {
      ruleName: "ds-stop-instance-tuesday",
      schedule: events.Schedule.cron({
        minute: "30",
        hour: "9",
        weekDay: "TUE",
      }),
    });
    stopRule.addTarget(new targets.LambdaFunction(stopInstanceLambda));

    // --- SSM Parameters ---
    new ssm.StringParameter(this, "TargetHostParam", {
      parameterName: "/ds/dev/target-host",
      stringValue: instance.instancePrivateIp,
    });

    new ssm.StringParameter(this, "TargetPortParam", {
      parameterName: "/ds/dev/target-port",
      stringValue: "5432",
    });

    new ssm.StringParameter(this, "VpcIdParam", {
      parameterName: "/ds/dev/vpc-id",
      stringValue: vpc.vpcId,
    });

    // --- Add return routes to shared account VPC ---
    // const subnetRouteTables = [
    //   "rtb-031a165c458201efe",
    //   "rtb-0151a5a2dff1719f9",
    // ];

    // subnetRouteTables.forEach((routeTableId, index) => {
    //   new ec2.CfnRoute(this, `RouteToShared${index}`, {
    //     routeTableId: routeTableId,
    //     destinationCidrBlock: "10.0.0.0/16",
    //     vpcPeeringConnectionId: "pcx-0f7a28a6ed40012dd", // ← new peering ID
    //   });
    // });

    // --- Add return routes to shared account VPC dynamically ---
    // Update this to ensure the Public Subnet knows how to talk back to Account 1
    const allSubnets = [...vpc.publicSubnets, ...vpc.isolatedSubnets];

    allSubnets.forEach((subnet, index) => {
      new ec2.CfnRoute(this, `RouteToShared${index}`, {
        // Matches your previous naming
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: "10.0.0.0/16",
        vpcPeeringConnectionId: "pcx-0a2fdf87e81afdb74", // Double-check this is the LATEST ID
      });
    });

    // --- Outputs ---
    new cdk.CfnOutput(this, "VpcId", { value: vpc.vpcId });
    new cdk.CfnOutput(this, "InstanceId", { value: instance.instanceId });
    new cdk.CfnOutput(this, "InstancePrivateIp", {
      value: instance.instancePrivateIp,
    });
    new cdk.CfnOutput(this, "VpcPeeringRoleArn", {
      value: vpcPeeringRole.roleArn,
      exportName: "DevVpcPeeringRoleArn",
    });
  }
}

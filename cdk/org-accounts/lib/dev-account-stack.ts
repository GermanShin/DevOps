import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export class DevAccountStack extends cdk.Stack {
  public readonly vpcCidr: string = "10.1.0.0/16";

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- VPC ---
    const vpc = new ec2.Vpc(this, "DevVpc", {
      ipAddresses: ec2.IpAddresses.cidr(this.vpcCidr),
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

    // --- Security Group for RDS ---
    const dbSecurityGroup = new ec2.SecurityGroup(this, "DbSecurityGroup", {
      vpc,
      description: "Allow PostgreSQL from shared account only",
      allowAllOutbound: false,
    });

    dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4("10.0.0.0/16"),
      ec2.Port.tcp(5432),
      "Allow PostgreSQL from shared account"
    );

    // --- DB Credentials in Secrets Manager ---
    const dbSecret = new secretsmanager.Secret(this, "DbSecret", {
      secretName: "/ds/dev/db-credentials",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "dbadmin" }),
        generateStringKey: "password",
        excludePunctuation: true,
      },
    });

    // --- RDS PostgreSQL ---
    const db = new rds.DatabaseInstance(this, "DevDatabase", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceIdentifier: "ds-dev-db",
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      credentials: rds.Credentials.fromSecret(dbSecret),
      multiAz: false,
      allocatedStorage: 20,
      storageEncrypted: true,
      deletionProtection: true,
      publiclyAccessible: false,
      databaseName: "dsdevdb",
    });

    // --- IAM Role for Lambda ---
    const lambdaRole = new iam.Role(this, "RdsSchedulerRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: "Role for RDS start/stop Lambda",
    });

    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "rds:StartDBInstance",
          "rds:StopDBInstance",
          "rds:DescribeDBInstances",
        ],
        resources: [db.instanceArn],
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

    // --- Lambda: Start RDS ---
    const startRdsLambda = new lambda.Function(this, "StartRdsLambda", {
      functionName: "ds-start-rds",
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "index.handler",
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      environment: {
        DB_INSTANCE_ID: "ds-dev-db",
      },
      code: lambda.Code.fromInline(`
import boto3
import os

def handler(event, context):
    rds = boto3.client('rds', region_name='ap-southeast-2')
    db_id = os.environ['DB_INSTANCE_ID']
    try:
        rds.start_db_instance(DBInstanceIdentifier=db_id)
        print(f"Successfully started RDS instance: {db_id}")
    except Exception as e:
        print(f"Error starting RDS: {e}")
        raise
      `),
    });

    // --- Lambda: Stop RDS ---
    const stopRdsLambda = new lambda.Function(this, "StopRdsLambda", {
      functionName: "ds-stop-rds",
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "index.handler",
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      environment: {
        DB_INSTANCE_ID: "ds-dev-db",
      },
      code: lambda.Code.fromInline(`
import boto3
import os

def handler(event, context):
    rds = boto3.client('rds', region_name='ap-southeast-2')
    db_id = os.environ['DB_INSTANCE_ID']
    try:
        rds.stop_db_instance(DBInstanceIdentifier=db_id)
        print(f"Successfully stopped RDS instance: {db_id}")
    except Exception as e:
        print(f"Error stopping RDS: {e}")
        raise
      `),
    });

    // --- EventBridge: Start RDS at 8:50 AM UTC every Tuesday ---
    const startRule = new events.Rule(this, "StartRdsRule", {
      ruleName: "ds-start-rds-tuesday",
      schedule: events.Schedule.cron({
        minute: "50",
        hour: "8",
        weekDay: "TUE",
      }),
    });
    startRule.addTarget(new targets.LambdaFunction(startRdsLambda));

    // --- EventBridge: Stop RDS at 9:30 AM UTC every Tuesday ---
    const stopRule = new events.Rule(this, "StopRdsRule", {
      ruleName: "ds-stop-rds-tuesday",
      schedule: events.Schedule.cron({
        minute: "30",
        hour: "9",
        weekDay: "TUE",
      }),
    });
    stopRule.addTarget(new targets.LambdaFunction(stopRdsLambda));

    // --- SSM Parameters ---
    new ssm.StringParameter(this, "DbEndpointParam", {
      parameterName: "/ds/dev/db-endpoint",
      stringValue: db.dbInstanceEndpointAddress,
    });

    new ssm.StringParameter(this, "DbPortParam", {
      parameterName: "/ds/dev/db-port",
      stringValue: db.dbInstanceEndpointPort,
    });

    new ssm.StringParameter(this, "VpcIdParam", {
      parameterName: "/ds/dev/vpc-id",
      stringValue: vpc.vpcId,
    });

    // --- Outputs ---
    new cdk.CfnOutput(this, "VpcId", { value: vpc.vpcId });
    new cdk.CfnOutput(this, "DbEndpoint", {
      value: db.dbInstanceEndpointAddress,
    });
    new cdk.CfnOutput(this, "DbInstanceId", { value: "ds-dev-db" });
  }
}

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cr from "aws-cdk-lib/custom-resources";

export class ConfigSetupStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── S3 bucket for Config delivery ─────────────────────────────────────
    const configBucket = new s3.Bucket(this, "ConfigBucket", {
      bucketName: `config-delivery-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [{ expiration: cdk.Duration.days(365), enabled: true }],
    });

    configBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowConfigGetBucketAcl",
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("config.amazonaws.com")],
        actions: ["s3:GetBucketAcl"],
        resources: [configBucket.bucketArn],
      }),
    );
    configBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowConfigPutObject",
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("config.amazonaws.com")],
        actions: ["s3:PutObject"],
        resources: [`${configBucket.bucketArn}/AWSLogs/${this.account}/Config/*`],
        conditions: {
          StringEquals: { "s3:x-amz-acl": "bucket-owner-full-control" },
        },
      }),
    );

    // ── IAM role for Config recorder ──────────────────────────────────────
    const configRole = new iam.Role(this, "ConfigRole", {
      assumedBy: new iam.ServicePrincipal("config.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWS_ConfigRole"),
      ],
    });

    // ── Step 1: Create recorder (does NOT start it yet) ───────────────────
    const recorderSetup = new cr.AwsCustomResource(this, "ConfigRecorderSetup", {
      onCreate: {
        service: "ConfigService",
        action: "putConfigurationRecorder",
        parameters: {
          ConfigurationRecorder: {
            name: "default",
            roleARN: configRole.roleArn,
            recordingGroup: {
              allSupported: true,
              includeGlobalResourceTypes: true,
            },
          },
        },
        physicalResourceId: cr.PhysicalResourceId.of("config-recorder-default"),
      },
      onDelete: {
        service: "ConfigService",
        action: "deleteConfigurationRecorder",
        parameters: { ConfigurationRecorderName: "default" },
        ignoreErrorCodesMatching: "NoSuchConfigurationRecorderException",
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ["config:PutConfigurationRecorder", "config:DeleteConfigurationRecorder"],
          resources: ["*"],
        }),
        new iam.PolicyStatement({
          actions: ["iam:PassRole"],
          resources: [configRole.roleArn],
        }),
      ]),
    });

    // ── Step 2: Create delivery channel (recorder must exist first) ───────
    const deliveryChannelSetup = new cr.AwsCustomResource(this, "ConfigDeliveryChannelSetup", {
      onCreate: {
        service: "ConfigService",
        action: "putDeliveryChannel",
        parameters: {
          DeliveryChannel: {
            name: "default",
            s3BucketName: configBucket.bucketName,
            configSnapshotDeliveryProperties: {
              deliveryFrequency: "TwentyFour_Hours",
            },
          },
        },
        physicalResourceId: cr.PhysicalResourceId.of("config-delivery-channel-default"),
      },
      onDelete: {
        service: "ConfigService",
        action: "deleteDeliveryChannel",
        parameters: { DeliveryChannelName: "default" },
        ignoreErrorCodesMatching: "NoSuchDeliveryChannelException",
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });
    deliveryChannelSetup.node.addDependency(recorderSetup);

    // ── Step 3: Start recorder (delivery channel must exist first) ────────
    const startRecorder = new cr.AwsCustomResource(this, "StartConfigRecorder", {
      onCreate: {
        service: "ConfigService",
        action: "startConfigurationRecorder",
        parameters: { ConfigurationRecorderName: "default" },
        physicalResourceId: cr.PhysicalResourceId.of("config-recorder-start"),
      },
      onDelete: {
        service: "ConfigService",
        action: "stopConfigurationRecorder",
        parameters: { ConfigurationRecorderName: "default" },
        ignoreErrorCodesMatching: "NoSuchConfigurationRecorderException",
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });
    startRecorder.node.addDependency(deliveryChannelSetup);
  }
}

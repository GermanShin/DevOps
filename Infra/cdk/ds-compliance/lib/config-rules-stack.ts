import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as config from "aws-cdk-lib/aws-config";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from "path";

export class ConfigRulesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── Rule 1: S3 buckets must block public access ───────────────────────
    new config.ManagedRule(this, "S3PublicAccessProhibited", {
      configRuleName: "s3-bucket-public-access-prohibited",
      identifier:
        config.ManagedRuleIdentifiers.S3_BUCKET_LEVEL_PUBLIC_ACCESS_PROHIBITED,
      ruleScope: config.RuleScope.fromResource(config.ResourceType.S3_BUCKET),
    });

    // ── Rule 2: NAT Gateways are not allowed ─────────────────────────────
    const natGatewayEvaluator = new NodejsFunction(this, "NatGatewayEvaluator", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambda/nat-gateway-evaluator.ts"),
      handler: "handler",
      bundling: {
        minify: true,
        externalModules: ["@aws-sdk/*"],
      },
    });

    natGatewayEvaluator.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["config:PutEvaluations"],
        resources: ["*"],
      }),
    );

    new config.CustomRule(this, "NoNatGateway", {
      configRuleName: "no-nat-gateway",
      lambdaFunction: natGatewayEvaluator,
      configurationChanges: true,
      ruleScope: config.RuleScope.fromResource(
        config.ResourceType.of("AWS::EC2::NatGateway"),
      ),
    });
  }
}

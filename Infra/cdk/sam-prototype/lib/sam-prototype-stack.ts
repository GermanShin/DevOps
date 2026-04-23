import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { Construct } from 'constructs';
import { Config } from './config';

export interface SamPrototypeStackProps extends cdk.StackProps {
  readonly config: Config;
}

export class SamPrototypeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SamPrototypeStackProps) {
    super(scope, id, props);

    const { appName } = props.config;

    const apiHandler = new lambdaNodejs.NodejsFunction(this, 'ApiHandler', {
      functionName: `${appName}-api-handler`,
      entry: path.join(__dirname, '../lambda/api/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        VERSION: props.config.lambdaVersion,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
      currentVersionOptions: {
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      },
    });

    const alias = new lambda.Alias(this, 'LiveAlias', {
      aliasName: 'live',
      version: apiHandler.currentVersion,
    });

    // Rollback trigger: CodeDeploy automatically rolls back if errors spike during shift
    const errorAlarm = new cloudwatch.Alarm(this, 'ErrorAlarm', {
      metric: alias.metricErrors({ period: cdk.Duration.minutes(1) }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Rollback deployment if Lambda errors occur during traffic shift',
    });

    const deploymentConfig = new codedeploy.LambdaDeploymentConfig(this, 'DeploymentConfig', {
      trafficRouting: new codedeploy.TimeBasedCanaryTrafficRouting({
        percentage: props.config.trafficShift.percentage,
        interval: cdk.Duration.minutes(props.config.trafficShift.intervalMinutes),
      }),
    });

    new codedeploy.LambdaDeploymentGroup(this, 'DeploymentGroup', {
      alias,
      deploymentConfig,
      alarms: [errorAlarm],
    });

    const httpApi = new apigatewayv2.HttpApi(this, 'HttpApi', {
      apiName: `${appName}-api`,
      corsPreflight: {
        allowHeaders: ['Content-Type', 'Authorization'],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.DELETE,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ['*'],
      },
    });

    const integration = new apigatewayv2integrations.HttpLambdaIntegration(
      'LambdaIntegration',
      alias,
    );

    httpApi.addRoutes({
      path: '/items',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
      integration,
    });

    httpApi.addRoutes({
      path: '/items/{id}',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.DELETE],
      integration,
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.apiEndpoint,
      description: 'HTTP API endpoint URL',
    });
  }
}

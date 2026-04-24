import * as cdk from 'aws-cdk-lib';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { Construct } from 'constructs';
import { Config } from './config';

export interface SesPrototypeStackProps extends cdk.StackProps {
  readonly config: Config;
}

export class SesPrototypeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SesPrototypeStackProps) {
    super(scope, id, props);

    const { appName, senderEmail, testRecipientEmail } = props.config;

    // Verifies senderEmail — AWS sends a verification link to that address
    new ses.EmailIdentity(this, 'SenderIdentity', {
      identity: ses.Identity.email(senderEmail),
    });

    // Also verify the test recipient so we can send to it while in SES sandbox
    new ses.EmailIdentity(this, 'RecipientIdentity', {
      identity: ses.Identity.email(testRecipientEmail),
    });

    // Configuration Set routes SES event notifications to destinations
    const configSet = new ses.ConfigurationSet(this, 'ConfigSet', {
      configurationSetName: `${appName}-config-set`,
    });

    // SNS Topic receives all SES event notifications
    const sesTopic = new sns.Topic(this, 'SesEventsTopic', {
      topicName: `${appName}-ses-events`,
      displayName: `${appName} SES Events`,
    });

    // Wire all relevant SES events → SNS
    configSet.addEventDestination('SnsDestination', {
      destination: ses.EventDestination.snsTopic(sesTopic),
      events: [
        ses.EmailSendingEvent.SEND,
        ses.EmailSendingEvent.REJECT,
        ses.EmailSendingEvent.BOUNCE,
        ses.EmailSendingEvent.COMPLAINT,
        ses.EmailSendingEvent.DELIVERY,
        ses.EmailSendingEvent.RENDERING_FAILURE,
        ses.EmailSendingEvent.DELIVERY_DELAY,
      ],
    });

    const logGroup = new logs.LogGroup(this, 'SesEventLoggerLogGroup', {
      logGroupName: `/aws/lambda/${appName}-ses-event-logger`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Lambda parses SNS messages and emits structured logs to CloudWatch
    const sesEventLogger = new lambdaNodejs.NodejsFunction(this, 'SesEventLogger', {
      functionName: `${appName}-ses-event-logger`,
      entry: path.join(__dirname, '../lambda/ses-event-logger/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      logGroup,
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    sesTopic.addSubscription(new snsSubscriptions.LambdaSubscription(sesEventLogger));

    new cdk.CfnOutput(this, 'SenderEmail', {
      value: senderEmail,
      description: 'Verified SES sender — check inbox for the verification link',
    });

    new cdk.CfnOutput(this, 'ConfigSetName', {
      value: configSet.configurationSetName,
      description: 'Pass this as ConfigurationSetName when calling ses:SendEmail',
    });

    new cdk.CfnOutput(this, 'SesTopicArn', {
      value: sesTopic.topicArn,
      description: 'SNS Topic ARN receiving SES events',
    });

    new cdk.CfnOutput(this, 'LogGroupName', {
      value: `/aws/lambda/${appName}-ses-event-logger`,
      description: 'CloudWatch Log Group — tail this to see SES events',
    });
  }
}

import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cw_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";
import { EnvConfig } from "../config";

interface MonitoringStackProps extends cdk.StackProps {
  cfg: EnvConfig;
  service: ecs.FargateService;
  alb: elbv2.ApplicationLoadBalancer;
  db: rds.DatabaseInstance;
}

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const { cfg, service, alb, db } = props;

    // ── SNS Topic ─────────────────────────────────────────────────────
    const alertTopic = new sns.Topic(this, "AlertTopic", {
      topicName: `${cfg.envName}-ds-app-alerts`,
      displayName: `${cfg.envName} DS App Alerts`,
    });

    alertTopic.addSubscription(new subs.EmailSubscription(cfg.alertEmail));

    const alarmAction = new cw_actions.SnsAction(alertTopic);

    // ── ECS CPU Alarm ─────────────────────────────────────────────────
    new cloudwatch.Alarm(this, "EcsCpuAlarm", {
      alarmName: `${cfg.envName}-ecs-cpu-high`,
      alarmDescription: "ECS CPU utilisation exceeded 80%",
      metric: service.metricCpuUtilization({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    // ── ECS Memory Alarm ──────────────────────────────────────────────
    new cloudwatch.Alarm(this, "EcsMemAlarm", {
      alarmName: `${cfg.envName}-ecs-memory-high`,
      alarmDescription: "ECS memory utilisation exceeded 75%",
      metric: service.metricMemoryUtilization({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 75,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    // ── ALB 5xx Alarm ─────────────────────────────────────────────────
    new cloudwatch.Alarm(this, "Alb5xxAlarm", {
      alarmName: `${cfg.envName}-alb-5xx-errors`,
      alarmDescription: "ALB 5xx error count exceeded 5 in 1 minute",
      metric: alb.metrics.httpCodeElb(elbv2.HttpCodeElb.ELB_5XX_COUNT, {
        period: cdk.Duration.minutes(1),
      }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    // ── ALB Response Time Alarm ───────────────────────────────────────
    new cloudwatch.Alarm(this, "AlbResponseTimeAlarm", {
      alarmName: `${cfg.envName}-alb-response-time-high`,
      alarmDescription: "ALB average response time exceeded 2 seconds",
      metric: alb.metrics.targetResponseTime({
        period: cdk.Duration.minutes(5),
        statistic: "Average",
      }),
      threshold: 2,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    // ── RDS CPU Alarm ─────────────────────────────────────────────────
    new cloudwatch.Alarm(this, "RdsCpuAlarm", {
      alarmName: `${cfg.envName}-rds-cpu-high`,
      alarmDescription: "RDS CPU utilisation exceeded 80%",
      metric: db.metricCPUUtilization({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    // ── RDS Free Storage Alarm ────────────────────────────────────────
    new cloudwatch.Alarm(this, "RdsFreeStorageAlarm", {
      alarmName: `${cfg.envName}-rds-free-storage-low`,
      alarmDescription: "RDS free storage dropped below 5 GB",
      metric: db.metricFreeStorageSpace({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5 * 1024 * 1024 * 1024,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    // ── CloudWatch Dashboard ──────────────────────────────────────────
    new cloudwatch.Dashboard(this, "Dashboard", {
      dashboardName: `${cfg.envName}-ds-app`,
      widgets: [
        [
          new cloudwatch.GraphWidget({
            title: "ECS CPU Utilisation",
            left: [service.metricCpuUtilization()],
            width: 8,
          }),
          new cloudwatch.GraphWidget({
            title: "ECS Memory Utilisation",
            left: [service.metricMemoryUtilization()],
            width: 8,
          }),
          new cloudwatch.GraphWidget({
            title: "ALB Request Count",
            left: [alb.metrics.requestCount()],
            width: 8,
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: "ALB 5xx Errors",
            left: [alb.metrics.httpCodeElb(elbv2.HttpCodeElb.ELB_5XX_COUNT)],
            width: 8,
          }),
          new cloudwatch.GraphWidget({
            title: "ALB Response Time",
            left: [alb.metrics.targetResponseTime()],
            width: 8,
          }),
          new cloudwatch.GraphWidget({
            title: "RDS CPU Utilisation",
            left: [db.metricCPUUtilization()],
            width: 8,
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: "RDS Free Storage",
            left: [db.metricFreeStorageSpace()],
            width: 8,
          }),
          new cloudwatch.GraphWidget({
            title: "RDS DB Connections",
            left: [db.metricDatabaseConnections()],
            width: 8,
          }),
        ],
      ],
    });

    // ── Tags ──────────────────────────────────────────────────────────
    cdk.Tags.of(this).add("Environment", cfg.envName);
    cdk.Tags.of(this).add("Owner", "Dylan.Shin");
    cdk.Tags.of(this).add("Project", "ds-app");
  }
}

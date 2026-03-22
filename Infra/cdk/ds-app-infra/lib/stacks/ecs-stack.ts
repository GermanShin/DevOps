import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { EnvConfig } from "../config";

interface EcsStackProps extends cdk.StackProps {
  cfg: EnvConfig;
  vpc: ec2.Vpc;
  albSg: ec2.SecurityGroup;
  ecsSg: ec2.SecurityGroup;
  // Optional — wire these in after ECS is verified
  db?: rds.DatabaseInstance;
  dbSecret?: rds.DatabaseSecret;
  certArn?: string; // ← add this — optional until Phase 6
}

export class EcsStack extends cdk.Stack {
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly service: ecs.FargateService;
  public readonly repo: ecr.Repository;

  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    const { cfg, vpc, albSg, ecsSg, db, dbSecret } = props;

    // ── ECR Repository ────────────────────────────────────────────────
    this.repo = new ecr.Repository(this, "AppRepo", {
      repositoryName: `${cfg.envName}-ds-app`,
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      lifecycleRules: [
        {
          maxImageCount: 10,
          description: "Keep last 10 images",
        },
      ],
    });

    // ── CloudWatch Log Group ──────────────────────────────────────────
    const logGroup = new logs.LogGroup(this, "AppLogGroup", {
      logGroupName: `/ecs/${cfg.envName}-ds-app`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ── ECS Cluster ───────────────────────────────────────────────────
    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      clusterName: `${cfg.envName}-ds-app-cluster`,
      containerInsights: true,
    });

    // ── Task Definition ───────────────────────────────────────────────
    const taskDef = new ecs.FargateTaskDefinition(this, "TaskDef", {
      cpu: cfg.ecsCpu,
      memoryLimitMiB: cfg.ecsMemory,
      family: `${cfg.envName}-ds-app`,
    });

    // Grant DB secret access only when dbSecret is provided
    if (dbSecret) {
      dbSecret.grantRead(taskDef.taskRole);
    }

    // ── Environment Variables ─────────────────────────────────────────
    // Base env vars — always present
    const environment: Record<string, string> = {
      SPRING_PROFILES_ACTIVE: cfg.envName,
    };

    // DB env vars — only when db is provided
    if (db) {
      environment.DB_HOST = db.instanceEndpoint.hostname;
      environment.DB_PORT = "5432";
      environment.DB_NAME = cfg.rdsDatabaseName;
    }

    // ── Secrets ───────────────────────────────────────────────────────
    // Only populated when dbSecret is provided
    const secrets: Record<string, ecs.Secret> = {};
    if (dbSecret) {
      secrets.DB_USERNAME = ecs.Secret.fromSecretsManager(dbSecret, "username");
      secrets.DB_PASSWORD = ecs.Secret.fromSecretsManager(dbSecret, "password");
    }

    // ── Container ─────────────────────────────────────────────────────
    // Uses public.ecr.aws/nginx/nginx — requires NAT Gateway to be working
    // Will be replaced by your Spring Boot image in Phase 5
    taskDef.addContainer("AppContainer", {
      containerName: `${cfg.envName}-ds-app`,
      image: ecs.ContainerImage.fromEcrRepository(this.repo, "latest"),
      portMappings: [
        {
          containerPort: cfg.ecsAppPort,
          protocol: ecs.Protocol.TCP,
        },
      ],
      environment,
      // Secrets only injected when dbSecret is wired in
      ...(Object.keys(secrets).length > 0 && { secrets }),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: `${cfg.envName}-ds-app`,
        logGroup,
      }),
      // Health check disabled for placeholder image
      // Uncomment in Phase 5 when Spring Boot image is deployed:
      healthCheck: {
        command: [
          "CMD-SHELL",
          "curl -f http://localhost:8080/actuator/health || exit 1",
        ],
        interval: cdk.Duration.seconds(15),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(90),
      },
    });

    // ── Application Load Balancer ─────────────────────────────────────
    this.alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      loadBalancerName: `${cfg.envName}-ds-app-alb`,
    });

    // ── Target Group ──────────────────────────────────────────────────
    const tg = new elbv2.ApplicationTargetGroup(this, "TargetGroup", {
      vpc,
      port: cfg.ecsAppPort,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      targetGroupName: `${cfg.envName}-ds-app-tg`,
      healthCheck: {
        path: "/actuator/health",
        healthyHttpCodes: "200",
        interval: cdk.Duration.seconds(15),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      deregistrationDelay: cdk.Duration.seconds(10),
    });

    // ── HTTP Listener ─────────────────────────────────────────────────
    if (props.certArn) {
      // HTTPS available — redirect HTTP to HTTPS
      this.alb.addListener("HttpListener", {
        port: 80,
        defaultAction: elbv2.ListenerAction.redirect({
          protocol: "HTTPS",
          port: "443", // ← put this back
          permanent: true,
        }),
      });

      // HTTPS listener with certificate
      this.alb.addListener("HttpsListener", {
        port: 443,
        certificates: [elbv2.ListenerCertificate.fromArn(props.certArn)],
        defaultTargetGroups: [tg],
      });
    } else {
      // No certificate yet — HTTP forwards directly to target group
      this.alb.addListener("HttpListener", {
        port: 80,
        defaultTargetGroups: [tg],
      });
    }

    // ── Fargate Service ───────────────────────────────────────────────
    this.service = new ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition: taskDef,
      serviceName: `${cfg.envName}-ds-app-service`,
      desiredCount: cfg.ecsMinTasks,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [ecsSg],
      assignPublicIp: false,
      healthCheckGracePeriod: cdk.Duration.seconds(120),
      circuitBreaker: { rollback: false },
    });
    this.service.attachToApplicationTargetGroup(tg);

    // ── Auto Scaling ──────────────────────────────────────────────────
    const scaling = this.service.autoScaleTaskCount({
      minCapacity: cfg.ecsMinTasks,
      maxCapacity: cfg.ecsMaxTasks,
    });
    scaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(30),
    });
    scaling.scaleOnMemoryUtilization("MemScaling", {
      targetUtilizationPercent: 75,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(30),
    });

    // ── Tags ──────────────────────────────────────────────────────────
    cdk.Tags.of(this).add("Environment", cfg.envName);
    cdk.Tags.of(this).add("Owner", "Dylan.Shin");
    cdk.Tags.of(this).add("Project", "ds-app");
  }
}

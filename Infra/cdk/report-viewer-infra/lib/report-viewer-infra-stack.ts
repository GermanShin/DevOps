import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as elbv2_targets from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import * as elbv2_actions from "aws-cdk-lib/aws-elasticloadbalancingv2-actions";
import * as route53_targets from "aws-cdk-lib/aws-route53-targets";
import { Config } from "./config";

export interface ReportViewerInfraStackProps extends cdk.StackProps {
  cfg: Config;
}

export class ReportViewerInfraStack extends cdk.Stack {
  public readonly slaReportBucket: s3.IBucket;

  constructor(
    scope: Construct,
    id: string,
    props: ReportViewerInfraStackProps,
  ) {
    super(scope, id, props);

    const { cfg } = props;

    // ── Hosted Zone — already exists in ds-shared account ────────────────
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, "Zone", {
      hostedZoneId: cfg.hostedZoneId,
      zoneName: cfg.zoneName,
    });

    // S3 Bucket for  Reports
    const slaReportBucket = cfg.reportBucketName
      ? s3.Bucket.fromBucketName(this, "SLAReportBucket", cfg.reportBucketName)
      : new s3.Bucket(this, "SLAReportBucket", {
          bucketName: `sla-reports-${this.account}`,
          versioned: false,
          encryption: s3.BucketEncryption.S3_MANAGED,
          blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS_ONLY,
          publicReadAccess: true,
          lifecycleRules: [
            {
              // Optional: Auto-delete old reports after 90 days
              expiration: cdk.Duration.days(90),
              enabled: false, // Set to true if you want auto-deletion
            },
          ],
        });

    this.slaReportBucket = slaReportBucket;

    // Create Dummy A record for the parent domain for cognito custom domain
    const parentDomainRecord = new route53.ARecord(
      this,
      "SlaReportCognitoDummyAliasRecord",
      {
        zone: zone,
        target: route53.RecordTarget.fromIpAddresses(cfg.dummyIdAddress), //TEST-NET Dummy IP
        recordName: "", //This automatically will use hosted zone apex (shared.ds-shin.com)
      },
    );

    const customCognitoDomainCert = acm.Certificate.fromCertificateArn(
      this,
      "CognitoDomainCert",
      cfg.cognitoCustomDomainCertARN,
    );

    // Cognito user pool
    const userPool = new cognito.UserPool(this, "SlaReportUserPool", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: { minLength: 12 },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
    });

    //App client (we’ll point callback to ALB first; later to CloudFront)
    const userPoolClient = userPool.addClient("AppClient", {
      generateSecret: true,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        // For now, we just want to SEE the login page.
        // We'll update this to your real app URL after ALB/CloudFront exists.
        callbackUrls: [`https://${cfg.dashboardFqdn}/oauth2/idpresponse`],
        logoutUrls: [`https://${cfg.dashboardFqdn}/`],
      },
    });

    // Cognito custom domain: slareportlogin.shared.ds-shin.com
    //slareportlogin.shared.ds-shin.com
    const userPoolDomain = userPool.addDomain("SLAReportUserPoolDomain", {
      customDomain: {
        domainName: cfg.loginFqdn,
        certificate: customCognitoDomainCert,
      },
    });

    userPoolDomain.node.addDependency(parentDomainRecord);

    // Route53 CNAME: slareportlogin.shared.ds-shin.com → Cognito's CloudFront domain
    new route53.CnameRecord(this, "CognitoLoginCname", {
      zone,
      recordName: cfg.loginFqdn,
      domainName: userPoolDomain.cloudFrontEndpoint,
    });

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0, // ← This removes NAT Gateways!
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    // Dashboard lambda
    const dashboardFn = new NodejsFunction(this, "DashboardFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../lambda/dashboard.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        ALLURE_BUCKET_NAME: this.slaReportBucket.bucketName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: ["@aws-sdk/*"], // AWS SDK v3 is available in Lambda runtime
      },
    });

    // Grant Lambda read access to S3
    slaReportBucket.grantRead(dashboardFn);

    const albCert = new acm.Certificate(this, "AlbCert", {
      domainName: cfg.dashboardFqdn, // slareport.shared.ds-shin.com
      validation: acm.CertificateValidation.fromDns(zone),
    });
    // ALB
    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
    });

    // Route53 alias: slareport.shared.ds-shin.com → ALB
    new route53.ARecord(this, "AlbAliasRecord", {
      zone,
      recordName: cfg.dashboardFqdn,
      target: route53.RecordTarget.fromAlias(
        new route53_targets.LoadBalancerTarget(alb),
      ),
    });

    // HTTP 80 -> redirect to HTTPS 443
    alb.addListener("HttpListener", {
      port: 80,
      open: true,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: "HTTPS",
        port: "443",
        permanent: true,
      }),
    });

    // HTTPS listener (required for authenticate-cognito)
    const httpsListener = alb.addListener("HttpsListener", {
      port: 443,
      open: true,
      certificates: [elbv2.ListenerCertificate.fromCertificateManager(albCert)],
    });

    const tg = new elbv2.ApplicationTargetGroup(this, "LambdaTg", {
      targetType: elbv2.TargetType.LAMBDA,
      targets: [new elbv2_targets.LambdaTarget(dashboardFn)],
    });

    httpsListener.addAction("Default", {
      action: new elbv2_actions.AuthenticateCognitoAction({
        userPool,
        userPoolClient,
        userPoolDomain,
        next: elbv2.ListenerAction.forward([tg]),
      }),
    });
  }
}

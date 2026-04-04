import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cognito from "aws-cdk-lib/aws-cognito";
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
          blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
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
  }
}

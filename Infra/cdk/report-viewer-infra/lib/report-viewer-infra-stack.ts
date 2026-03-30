import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Config } from "./config";

export interface ReportViewerInfraStackProps extends cdk.StackProps {
  cfg: Config;
}

export class ReportViewerInfraStack extends cdk.Stack {
  public readonly slaReportBucket: s3.IBucket;

  constructor(
    scope: Construct,
    id: string,
    props: ReportViewerInfraStackProps
  ) {
    super(scope, id, props);

    const { cfg } = props;

    // ── Hosted Zone — already exists in ds-shared account ────────────────
    const zone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      "HostedZone",
      {
        hostedZoneId: cfg.hostedZoneId,
        zoneName: cfg.hostedZoneName,
      }
    );

    // S3 Bucket for  Reports
    // If you already have a bucket, use fromBucketName instead
    const slaReportBucket = cfg.reportBucketName
      ? s3.Bucket.fromBucketName(this, "SLAReportBucket", cfg.reportBucketName)
      : new s3.Bucket(this, "SLAReportBucket", {
          bucketName: `sla-reports-${this.account}`,
          versioned: false,
          encryption: s3.BucketEncryption.S3_MANAGED,
          blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
          removalPolicy: cdk.RemovalPolicy.RETAIN, // Don't delete reports on stack deletion
          autoDeleteObjects: false,
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
      }
    );
  }
}

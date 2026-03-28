import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Config } from "./config";

export interface ReportViewerInfraStackProps extends cdk.StackProps {
  cfg: Config;
}

export class ReportViewerInfraStack extends cdk.Stack {
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
  }
}

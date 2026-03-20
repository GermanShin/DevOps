import * as cdk from "aws-cdk-lib";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";
import { EnvConfig } from "../config";

interface DnsStackProps extends cdk.StackProps {
  cfg: EnvConfig;
  alb: elbv2.ApplicationLoadBalancer;
}

export class DnsStack extends cdk.Stack {
  public readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props);

    const { cfg, alb } = props;

    // ── Hosted Zone — already exists in ds-dev account ────────────────
    const zone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      "HostedZone",
      {
        hostedZoneId: cfg.hostedZoneId,
        zoneName: cfg.hostedZoneName,
      }
    );

    // ── ACM Certificate — DNS validated automatically via Route 53 ────
    this.certificate = new acm.Certificate(this, "Certificate", {
      domainName: cfg.domainName,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    // ── Route 53 A Record — Alias to ALB ─────────────────────────────
    new route53.ARecord(this, "AliasRecord", {
      zone,
      recordName: cfg.domainName,
      target: route53.RecordTarget.fromAlias(
        new targets.LoadBalancerTarget(alb)
      ),
    });

    // ── Tags ──────────────────────────────────────────────────────────
    cdk.Tags.of(this).add("Environment", cfg.envName);
    cdk.Tags.of(this).add("Owner", "Dylan.Shin");
    cdk.Tags.of(this).add("Project", "ds-app");
  }
}

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { GlobalConfig } from "./config";

export interface GlobalStackProps extends cdk.StackProps {
  gcfg: GlobalConfig;
}

export class GlobalStack extends cdk.Stack {
  public readonly cloudFrontCertArn: string;
  public readonly cognitoCustomDomainCertArn: string;

  constructor(scope: Construct, id: string, props: GlobalStackProps) {
    super(scope, id, props);

    const { gcfg } = props;

    const zone = route53.HostedZone.fromLookup(this, "Zone", {
      domainName: gcfg.parentDomainName,
    });

    const cert = new acm.Certificate(this, "CloudFrontCert", {
      domainName: gcfg.dashboardFqdn,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    const cognitoCustomDomainCert = new acm.Certificate(
      this,
      "CognitoCustomDomainCert",
      {
        domainName: gcfg.loginFqdn,
        validation: acm.CertificateValidation.fromDns(zone),
      }
    );

    this.cloudFrontCertArn = cert.certificateArn;
    this.cognitoCustomDomainCertArn = cognitoCustomDomainCert.certificateArn;

    new cdk.CfnOutput(this, "CloudFrontCertArn", {
      value: cert.certificateArn,
    });

    new cdk.CfnOutput(this, "CognitoCustomDomainCertArn", {
      value: cognitoCustomDomainCert.certificateArn,
    });
  }
}

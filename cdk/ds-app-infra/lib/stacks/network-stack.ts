// lib/network-stack.ts
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { EnvConfig } from "../config";

// Extend StackProps to include your config
interface NetworkStackProps extends cdk.StackProps {
  cfg: EnvConfig;
}

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly albSg: ec2.SecurityGroup;
  public readonly ecsSg: ec2.SecurityGroup;
  public readonly rdsSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { cfg } = props;

    this.vpc = new ec2.Vpc(this, "AppVpc", {
      vpcName: `${cfg.envName}-app-vpc`, // e.g. "dev-app-vpc"
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      maxAzs: 2,
      natGateways: cfg.natGateways, // 1 for dev/uat, 2 for prod
      subnetConfiguration: [
        { subnetType: ec2.SubnetType.PUBLIC, name: "Public", cidrMask: 24 },
        {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          name: "PrivateApp",
          cidrMask: 24,
        },
        {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          name: "PrivateData",
          cidrMask: 24,
        },
      ],
    });

    this.albSg = new ec2.SecurityGroup(this, "AlbSg", {
      vpc: this.vpc,
      securityGroupName: `${cfg.envName}-alb-sg`,
      description: "ALB - public HTTPS and HTTP redirect",
      allowAllOutbound: true,
    });
    this.albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS");
    this.albSg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "HTTP redirect"
    );

    this.ecsSg = new ec2.SecurityGroup(this, "EcsSg", {
      vpc: this.vpc,
      securityGroupName: `${cfg.envName}-ecs-sg`,
      description: "ECS tasks - inbound from ALB only",
      allowAllOutbound: true,
    });
    this.ecsSg.addIngressRule(
      ec2.Peer.securityGroupId(this.albSg.securityGroupId),
      ec2.Port.tcp(8080),
      "From ALB"
    );

    this.rdsSg = new ec2.SecurityGroup(this, "RdsSg", {
      vpc: this.vpc,
      securityGroupName: `${cfg.envName}-rds-sg`,
      description: "RDS - inbound from ECS only",
      allowAllOutbound: false,
    });
    this.rdsSg.addIngressRule(
      ec2.Peer.securityGroupId(this.ecsSg.securityGroupId),
      ec2.Port.tcp(5432),
      "PostgreSQL from ECS"
    );

    // Tags applied to every resource in the stack
    cdk.Tags.of(this).add("Environment", cfg.envName);
    cdk.Tags.of(this).add("Owner", "Dylan.Shin");
    cdk.Tags.of(this).add("Project", "ds-app");
  }
}

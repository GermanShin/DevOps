import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ram from "aws-cdk-lib/aws-ram";
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

    this.vpc = new ec2.Vpc(this, `${cfg.envName}Vpc`, {
      vpcName: `${cfg.envName}-vpc`,
      ipAddresses: ec2.IpAddresses.cidr(cfg.vpcCidr),
      maxAzs: cfg.maxAzs,
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

    const vpc = this.vpc;

    if (cfg.envName === "shared") {
      // ── Transit Gateway ───────────────────────────────────────────────────────
      // Owned by Shared account; shared to Dev + Org via RAM
      const tgw = new ec2.CfnTransitGateway(this, "TransitGateway", {
        description: "Central TGW - Shared/Dev/Org hub",
        defaultRouteTableAssociation: "enable", // auto-associate attachments
        defaultRouteTablePropagation: "enable", // auto-propagate routes
        autoAcceptSharedAttachments: "enable", // accept cross-account attachments automatically
        tags: [{ key: "Name", value: "Central-TGW" }],
      });

      // ── Attach Shared VPC to TGW ──────────────────────────────────────────────
      const sharedAttachment = new ec2.CfnTransitGatewayAttachment(
        this,
        "SharedVpcAttachment",
        {
          transitGatewayId: tgw.ref,
          vpcId: this.vpc.vpcId,
          subnetIds: vpc.isolatedSubnets.map((s) => s.subnetId),
          tags: [{ key: "Name", value: "shared-vpc-attachment" }],
        }
      );

      // ── Routes: Shared subnet → Dev and Org via TGW ───────────────────────────
      const routeTable = vpc.isolatedSubnets[0].routeTable.routeTableId;

      new ec2.CfnRoute(this, "RouteToDev", {
        routeTableId: routeTable,
        destinationCidrBlock: cfg.tgwConfig.devVpcCidr,
        transitGatewayId: tgw.ref,
      }).addDependency(sharedAttachment); // ← attachment must exist before route

      new ram.CfnResourceShare(this, "TgwRamShare", {
        name: "central-tgw-share",
        resourceArns: [
          `arn:aws:ec2:${this.region}:${this.account}:transit-gateway/${tgw.ref}`,
        ],
        principals: [
          `arn:aws:organizations::${cfg.orgAccountId}:organization/${cfg.orgId}`,
        ],
        allowExternalPrincipals: false,
      });
    } else if (cfg.envName === "dev") {
      // ── VPC Endpoints ─────────────────────────────────────────────────
      // Allows ECS tasks in private subnets to reach AWS services
      // without going through the NAT Gateway

      // ECR API — for ECS to authenticate with ECR
      vpc.addInterfaceEndpoint("EcrApiEndpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.ECR,
        privateDnsEnabled: true,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      });

      // ECR Docker — for ECS to pull container images
      vpc.addInterfaceEndpoint("EcrDkrEndpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
        privateDnsEnabled: true,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      });

      // CloudWatch Logs — for the awslogs log driver
      vpc.addInterfaceEndpoint("CloudWatchLogsEndpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
        privateDnsEnabled: true,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      });

      // Secrets Manager — for DB credentials at task startup
      vpc.addInterfaceEndpoint("SecretsManagerEndpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
        privateDnsEnabled: true,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      });

      // S3 Gateway Endpoint — ECR uses S3 for image layers (free)
      vpc.addGatewayEndpoint("S3Endpoint", {
        service: ec2.GatewayVpcEndpointAwsService.S3,
        subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
      });

      // ── Security Groups: ALB, ECS, RDS ───────────────────────────
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
        vpc: vpc,
        securityGroupName: `${cfg.envName}-ecs-sg`,
        description: "ECS tasks - inbound from ALB only",
        allowAllOutbound: true,
      });

      this.ecsSg.addIngressRule(
        ec2.Peer.securityGroupId(this.albSg.securityGroupId),
        ec2.Port.tcp(cfg.ecsAppPort),
        "From ALB"
      );

      this.rdsSg = new ec2.SecurityGroup(this, "RdsSg", {
        vpc: vpc,
        securityGroupName: `${cfg.envName}-rds-sg`,
        description: "RDS - inbound from ECS only",
        allowAllOutbound: false,
      });

      this.rdsSg.addIngressRule(
        ec2.Peer.securityGroupId(this.ecsSg.securityGroupId),
        ec2.Port.tcp(5432),
        "PostgreSQL from ECS"
      );

      this.rdsSg.addIngressRule(
        ec2.Peer.ipv4(cfg.tgwConfig.sharedVpcCidr),
        ec2.Port.tcp(5432),
        "PostgreSQL from Shared VPC"
      );
    }

    // Tags applied to every resource in the stack
    cdk.Tags.of(this).add("Environment", cfg.envName);
    cdk.Tags.of(this).add("Owner", "Dylan.Shin");
    cdk.Tags.of(this).add("Project", "ds-app");
  }
}

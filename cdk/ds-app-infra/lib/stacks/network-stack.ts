// lib/network-stack.ts
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ram from "aws-cdk-lib/aws-ram";
import { Construct } from "constructs";
import { EnvConfig } from "../config";

// Extend StackProps to include your config
interface NetworkStackProps extends cdk.StackProps {
  cfg: EnvConfig;
}

export class NetworkStack extends cdk.Stack {
  // public readonly vpc: ec2.Vpc;
  public readonly albSg: ec2.SecurityGroup;
  public readonly ecsSg: ec2.SecurityGroup;
  public readonly rdsSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { cfg } = props;

    const vpc = new ec2.Vpc(this, `${cfg.envName}Vpc`, {
      vpcName: `${cfg.envName}-vpc`, // e.g. "dev-app-vpc"
      ipAddresses: ec2.IpAddresses.cidr(cfg.vpcCidr),
      // maxAzs: 2,
      maxAzs: 1,
      natGateways: cfg.natGateways, // 1 for dev/uat, 2 for prod
      subnetConfiguration: [
        // { subnetType: ec2.SubnetType.PUBLIC, name: "Public", cidrMask: 24 },
        // {
        //   subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        //   name: "PrivateApp",
        //   cidrMask: 24,
        // },
        {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          name: "PrivateData",
          cidrMask: 24,
        },
      ],
    });

    // ── S3 Gateway Endpoint (free — allows yum to work without internet) ──────
    vpc.addGatewayEndpoint("S3Endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    // ── SSM Interface Endpoints (no NAT/IGW required) ─────────────────────────
    const endpointSg = new ec2.SecurityGroup(this, "EndpointSg", {
      vpc,
      description: "Allow HTTPS from Shared VPC for SSM endpoints",
      allowAllOutbound: true,
    });
    endpointSg.addIngressRule(
      ec2.Peer.ipv4(cfg.vpcCidr),
      ec2.Port.tcp(443),
      "HTTPS from Shared VPC"
    );
    vpc.addInterfaceEndpoint("SsmEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.SSM,
      securityGroups: [endpointSg],
    });
    vpc.addInterfaceEndpoint("SsmMessagesEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
      securityGroups: [endpointSg],
    });
    vpc.addInterfaceEndpoint("Ec2MessagesEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
      securityGroups: [endpointSg],
    });

    // ── EC2 (SSM test client) ─────────────────────────────────────────────────
    const ec2Role = new iam.Role(this, "Ec2Role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
      ],
    });
    const sg = new ec2.SecurityGroup(this, "Ec2Sg", {
      vpc,
      allowAllOutbound: true,
    });

    const instance = new ec2.Instance(this, "Ec2Instance", {
      vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.NANO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup: sg,
      role: ec2Role,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      userDataCausesReplacement: true, // ← ADD: forces replacement when userdata changes
    });

    // this.albSg = new ec2.SecurityGroup(this, "AlbSg", {
    //   vpc: this.vpc,
    //   securityGroupName: `${cfg.envName}-alb-sg`,
    //   description: "ALB - public HTTPS and HTTP redirect",
    //   allowAllOutbound: true,
    // });
    // this.albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS");
    // this.albSg.addIngressRule(
    //   ec2.Peer.anyIpv4(),
    //   ec2.Port.tcp(80),
    //   "HTTP redirect"
    // );

    // this.ecsSg = new ec2.SecurityGroup(this, "EcsSg", {
    //   vpc: this.vpc,
    //   securityGroupName: `${cfg.envName}-ecs-sg`,
    //   description: "ECS tasks - inbound from ALB only",
    //   allowAllOutbound: true,
    // });
    // this.ecsSg.addIngressRule(
    //   ec2.Peer.securityGroupId(this.albSg.securityGroupId),
    //   ec2.Port.tcp(8080),
    //   "From ALB"
    // );

    // this.rdsSg = new ec2.SecurityGroup(this, "RdsSg", {
    //   vpc: this.vpc,
    //   securityGroupName: `${cfg.envName}-rds-sg`,
    //   description: "RDS - inbound from ECS only",
    //   allowAllOutbound: false,
    // });
    // this.rdsSg.addIngressRule(
    //   ec2.Peer.securityGroupId(this.ecsSg.securityGroupId),
    //   ec2.Port.tcp(5432),
    //   "PostgreSQL from ECS"
    // );

    if (cfg.envName === "shared") {
      instance.addUserData("#!/bin/bash", "yum install -y nc");

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
          vpcId: vpc.vpcId,
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
      instance.addUserData(
        "#!/bin/bash",
        "yum install -y nc",
        "cat > /usr/local/bin/listen5432.sh << 'EOF'",
        "#!/bin/bash",
        "while true; do nc -lk 5432; done",
        "EOF",
        "chmod +x /usr/local/bin/listen5432.sh",
        "nohup /usr/local/bin/listen5432.sh &>/var/log/listen5432.log &"
      );

      // ── Attach Dev VPC to the shared TGW ─────────────────────────────────────
      // RAM share is auto-accepted via org-level sharing set up in Step 0
      const attachment = new ec2.CfnTransitGatewayAttachment(
        this,
        "DevVpcAttachment",
        {
          transitGatewayId: cfg.transitGatewayId,
          vpcId: vpc.vpcId,
          subnetIds: vpc.isolatedSubnets.map((s) => s.subnetId),
          tags: [{ key: "Name", value: "dev-vpc-attachment" }],
        }
      );

      // ── Routes: Dev subnet → Shared and Org via TGW ───────────────────────────
      const routeTable = vpc.isolatedSubnets[0].routeTable.routeTableId;

      new ec2.CfnRoute(this, "RouteToShared", {
        routeTableId: routeTable,
        destinationCidrBlock: cfg.tgwConfig.sharedVpcCidr,
        transitGatewayId: cfg.transitGatewayId,
      }).addDependency(attachment); // ← attachment must exist before route

      sg.addIngressRule(
        ec2.Peer.ipv4(cfg.tgwConfig.sharedVpcCidr),
        ec2.Port.tcp(5432),
        "TCP 5432 from Shared VPC"
      );
    }

    // Tags applied to every resource in the stack
    cdk.Tags.of(this).add("Environment", cfg.envName);
    cdk.Tags.of(this).add("Owner", "Dylan.Shin");
    cdk.Tags.of(this).add("Project", "ds-app");
  }
}

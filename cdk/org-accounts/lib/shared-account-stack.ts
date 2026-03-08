import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ram from "aws-cdk-lib/aws-ram";
import { Construct } from "constructs";

export interface SharedStackProps extends cdk.StackProps {
  sharedVpcCidr: string;
  devVpcCidr: string;
  orgVpcCidr: string;
  devAccountId: string;
  orgAccountId: string;
  orgId: string;
}

export class SharedStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SharedStackProps) {
    super(scope, id, props);

    // ── VPC ──────────────────────────────────────────────────────────────────
    const vpc = new ec2.Vpc(this, "SharedVpc", {
      ipAddresses: ec2.IpAddresses.cidr(props.sharedVpcCidr),
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // ── SSM Interface Endpoints (no NAT/IGW required) ─────────────────────────
    const endpointSg = new ec2.SecurityGroup(this, "EndpointSg", {
      vpc,
      description: "Allow HTTPS from Shared VPC for SSM endpoints",
      allowAllOutbound: true,
    });
    endpointSg.addIngressRule(
      ec2.Peer.ipv4(props.sharedVpcCidr),
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
      destinationCidrBlock: props.devVpcCidr,
      transitGatewayId: tgw.ref,
    }).addDependency(sharedAttachment); // ← attachment must exist before route

    new ec2.CfnRoute(this, "RouteToOrg", {
      routeTableId: routeTable,
      destinationCidrBlock: props.orgVpcCidr,
      transitGatewayId: tgw.ref,
    }).addDependency(sharedAttachment);

    // ✅ Fix — auto-accepted, uses org trust we just enabled
    new ram.CfnResourceShare(this, "TgwRamShare", {
      name: "central-tgw-share",
      resourceArns: [
        `arn:aws:ec2:${this.region}:${this.account}:transit-gateway/${tgw.ref}`,
      ],
      principals: [
        `arn:aws:organizations::${props.orgAccountId}:organization/${props.orgId}`,
      ],
      allowExternalPrincipals: false,
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
    });
    instance.addUserData("#!/bin/bash", "yum install -y nc");

    // ── Outputs ───────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "TransitGatewayId", {
      value: tgw.ref,
      description: "[Step 2 & 3] TGW ID -> --context transitGatewayId=<value>",
      exportName: "CentralTransitGatewayId",
    });
    new cdk.CfnOutput(this, "Ec2InstanceId", {
      value: instance.instanceId,
      exportName: "SharedEc2InstanceId",
    });
    new cdk.CfnOutput(this, "Ec2PrivateIp", {
      value: instance.instancePrivateIp,
      exportName: "SharedEc2PrivateIp",
    });
  }
}

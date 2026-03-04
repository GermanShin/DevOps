import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface SharedStackProps extends cdk.StackProps {
  sharedVpcCidr: string; // This VPC's CIDR
  devVpcCidr: string; // Dev account VPC CIDR — used for routing
  devAccountId: string; // Dev account ID
  devVpcId: string; // Dev VPC ID        (from DevStack output)
  peeringRoleArn: string; // Peering role ARN  (from DevStack output)
  peerRegion: string; // Dev account region
}

/**
 * Shared Account Stack — Requester side of VPC peering
 *
 * Creates:
 *  - VPC (sharedVpcCidr) with one private isolated subnet
 *  - VPC Peering Connection to Dev account VPC
 *  - Route in Shared private subnet -> Dev VPC CIDR via peering
 *  - t3.nano EC2 (cheapest) accessible via SSM Session Manager
 *  - 3 SSM VPC Interface Endpoints (no NAT/IGW required)
 *
 * Deploy SECOND (after DevStack):
 *   cdk deploy SharedStack \
 *     --context devVpcId=<DevStack.VpcId> \
 *     --context peeringRoleArn=<DevStack.PeeringRoleArn> \
 *     --profile shared
 *
 * Note this output for Step 3:
 *  - SharedStack.PeeringConnectionId -> --context peeringConnectionId=<value>
 */
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

    // ── VPC Endpoints for SSM (replaces NAT + IGW for Session Manager) ────────
    const endpointSg = new ec2.SecurityGroup(this, "EndpointSg", {
      vpc,
      description: "Allow HTTPS from Shared VPC for SSM interface endpoints",
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

    // ── VPC Peering Connection (Shared -> Dev) ────────────────────────────────
    const peering = new ec2.CfnVPCPeeringConnection(this, "VpcPeering", {
      vpcId: vpc.vpcId,
      peerVpcId: props.devVpcId,
      peerOwnerId: props.devAccountId,
      peerRoleArn: props.peeringRoleArn,
      peerRegion: props.peerRegion,
      tags: [{ key: "Name", value: "Shared-to-Dev-Peering" }],
    });

    // ── Route: Shared private subnet -> Dev VPC CIDR via peering ─────────────
    new ec2.CfnRoute(this, "RouteToDev", {
      routeTableId: vpc.isolatedSubnets[0].routeTable.routeTableId,
      destinationCidrBlock: props.devVpcCidr,
      vpcPeeringConnectionId: peering.ref,
    });

    // ── EC2 IAM Role (SSM Session Manager access) ─────────────────────────────
    const ec2Role = new iam.Role(this, "Ec2InstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
      ],
    });

    // ── Security Group ────────────────────────────────────────────────────────
    const sg = new ec2.SecurityGroup(this, "Ec2Sg", {
      vpc,
      description: "Shared EC2 - test client, all outbound allowed",
      allowAllOutbound: true,
    });

    // ── EC2 Instance — t3.nano (cheapest burstable, no keypair) ──────────────
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
      userDataCausesReplacement: true,
    });

    // Pre-install nc for the TCP connectivity test
    instance.addUserData("#!/bin/bash", "yum install -y nc");

    // ── Outputs ───────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "PeeringConnectionId", {
      value: peering.ref,
      description:
        "[Step 3] VPC Peering Connection ID -> --context peeringConnectionId=<value>",
      exportName: "SharedPeeringConnectionId",
    });

    new cdk.CfnOutput(this, "Ec2InstanceId", {
      value: instance.instanceId,
      description:
        "Shared EC2 Instance ID - connect via SSM Session Manager to run the test",
      exportName: "SharedEc2InstanceId",
    });

    new cdk.CfnOutput(this, "Ec2PrivateIp", {
      value: instance.instancePrivateIp,
      description: "Shared EC2 private IP",
      exportName: "SharedEc2PrivateIp",
    });
  }
}

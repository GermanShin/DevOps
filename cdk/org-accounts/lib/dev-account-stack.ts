import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface DevStackProps extends cdk.StackProps {
  devVpcCidr: string; // This VPC's CIDR
  sharedVpcCidr: string; // Shared account CIDR — allowed inbound on port 5432
  sharedAccountId: string; // Shared account is allowed to initiate peering
}

/**
 * Dev Account Stack — Accepter side of VPC peering
 *
 * Creates:
 *  - VPC (devVpcCidr) with one private isolated subnet
 *  - IAM role that allows the Shared account to create the peering connection
 *  - t3.nano EC2 (cheapest) accessible via SSM Session Manager
 *  - Security Group: inbound TCP 5432 from Shared account VPC CIDR
 *  - 3 SSM VPC Interface Endpoints (no NAT/IGW required)
 *
 * Deploy FIRST:  cdk deploy DevStack --profile dev
 *
 * Note these outputs for the next steps:
 *  - DevStack.VpcId               -> --context devVpcId=...        (Step 2)
 *  - DevStack.PeeringRoleArn      -> --context peeringRoleArn=...  (Step 2)
 *  - DevStack.PrivateRouteTableId -> --context devRouteTableId=... (Step 3)
 *  - DevStack.Ec2PrivateIp        -> TCP test target from Shared EC2
 */
export class DevStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DevStackProps) {
    super(scope, id, props);

    // ── VPC ──────────────────────────────────────────────────────────────────
    const vpc = new ec2.Vpc(this, "DevVpc", {
      ipAddresses: ec2.IpAddresses.cidr(props.devVpcCidr),
      maxAzs: 1,
      natGateways: 0, // No NAT — zero cost; SSM uses VPC Interface Endpoints below
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
      description: "Allow HTTPS from Dev VPC for SSM interface endpoints",
      allowAllOutbound: true,
    });
    endpointSg.addIngressRule(
      ec2.Peer.ipv4(props.devVpcCidr),
      ec2.Port.tcp(443),
      "HTTPS from Dev VPC"
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

    // ── IAM Peering Role — lets Shared account initiate peering to this VPC ──
    const peeringRole = new iam.Role(this, "VpcPeeringRole", {
      roleName: "VpcPeeringAcceptRole",
      assumedBy: new iam.ArnPrincipal(
        `arn:aws:iam::${props.sharedAccountId}:root`
      ),
      description:
        "Allows Shared account CDK to create a VPC peering connection with Dev VPC",
    });
    peeringRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ec2:AcceptVpcPeeringConnection"],
        resources: ["*"],
      })
    );

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
      description: "Dev EC2 - accept TCP 5432 from Shared account VPC",
      allowAllOutbound: true,
    });
    sg.addIngressRule(
      ec2.Peer.ipv4(props.sharedVpcCidr),
      ec2.Port.tcp(5432),
      "TCP 5432 from Shared account VPC (peering connectivity test)"
    );

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

    // Boot script: keep nc listening on port 5432 so the Shared EC2 has a target
    instance.addUserData(
      "#!/bin/bash",
      "yum install -y nc",
      "# Loop nc so it re-opens after each accepted connection",
      "cat > /usr/local/bin/listen5432.sh << 'EOF'",
      "#!/bin/bash",
      "while true; do nc -lk 5432; done",
      "EOF",
      "chmod +x /usr/local/bin/listen5432.sh",
      "nohup /usr/local/bin/listen5432.sh &>/var/log/listen5432.log &"
    );

    // ── Outputs ───────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "VpcId", {
      value: vpc.vpcId,
      description: "[Step 2] Dev VPC ID -> --context devVpcId=<value>",
      exportName: "DevVpcId",
    });

    new cdk.CfnOutput(this, "PeeringRoleArn", {
      value: peeringRole.roleArn,
      description:
        "[Step 2] Peering role ARN -> --context peeringRoleArn=<value>",
      exportName: "DevPeeringRoleArn",
    });

    new cdk.CfnOutput(this, "PrivateRouteTableId", {
      value: vpc.isolatedSubnets[0].routeTable.routeTableId,
      description:
        "[Step 3] Dev private subnet route table ID -> --context devRouteTableId=<value>",
      exportName: "DevPrivateRouteTableId",
    });

    new cdk.CfnOutput(this, "Ec2PrivateIp", {
      value: instance.instancePrivateIp,
      description:
        "Dev EC2 private IP - use as TCP test target from Shared EC2",
      exportName: "DevEc2PrivateIp",
    });

    new cdk.CfnOutput(this, "Ec2InstanceId", {
      value: instance.instanceId,
      description: "Dev EC2 Instance ID - for SSM Session Manager access",
      exportName: "DevEc2InstanceId",
    });
  }
}

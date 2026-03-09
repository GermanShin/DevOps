import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface DevStackProps extends cdk.StackProps {
  devVpcCidr: string;
  sharedVpcCidr: string;
  orgVpcCidr: string;
  sharedAccountId: string;
  transitGatewayId: string; // From SharedStack output
}

export class DevStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DevStackProps) {
    super(scope, id, props);

    // ── VPC ──────────────────────────────────────────────────────────────────
    const vpc = new ec2.Vpc(this, "DevVpc", {
      ipAddresses: ec2.IpAddresses.cidr(props.devVpcCidr),
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

    // ── S3 Gateway Endpoint (free — allows yum to work without internet) ──────
    vpc.addGatewayEndpoint("S3Endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    // ── SSM Interface Endpoints (no NAT/IGW required) ─────────────────────────
    const endpointSg = new ec2.SecurityGroup(this, "EndpointSg", {
      vpc,
      description: "Allow HTTPS from Dev VPC for SSM endpoints",
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

    // ── Attach Dev VPC to the shared TGW ─────────────────────────────────────
    // RAM share is auto-accepted via org-level sharing set up in Step 0
    const attachment = new ec2.CfnTransitGatewayAttachment(
      this,
      "DevVpcAttachment",
      {
        transitGatewayId: props.transitGatewayId,
        vpcId: vpc.vpcId,
        subnetIds: vpc.isolatedSubnets.map((s) => s.subnetId),
        tags: [{ key: "Name", value: "dev-vpc-attachment" }],
      }
    );

    // ── Routes: Dev subnet → Shared and Org via TGW ───────────────────────────
    const routeTable = vpc.isolatedSubnets[0].routeTable.routeTableId;

    new ec2.CfnRoute(this, "RouteToShared", {
      routeTableId: routeTable,
      destinationCidrBlock: props.sharedVpcCidr,
      transitGatewayId: props.transitGatewayId,
    }).addDependency(attachment); // ← attachment must exist before route

    new ec2.CfnRoute(this, "RouteToOrg", {
      routeTableId: routeTable,
      destinationCidrBlock: props.orgVpcCidr,
      transitGatewayId: props.transitGatewayId,
    }).addDependency(attachment);

    // ── EC2 IAM Role (SSM Session Manager access) ─────────────────────────────
    const ec2Role = new iam.Role(this, "Ec2Role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
      ],
    });

    // ── Security Group: accept port 5432 from Shared and Org VPCs ────────────
    const sg = new ec2.SecurityGroup(this, "Ec2Sg", {
      vpc,
      description: "Dev EC2 - accept TCP 5432 from Shared and Org VPCs",
      allowAllOutbound: true,
    });
    sg.addIngressRule(
      ec2.Peer.ipv4(props.sharedVpcCidr),
      ec2.Port.tcp(5432),
      "TCP 5432 from Shared VPC"
    );
    sg.addIngressRule(
      ec2.Peer.ipv4(props.orgVpcCidr),
      ec2.Port.tcp(5432),
      "TCP 5432 from Org VPC"
    );

    // ── EC2 Instance ──────────────────────────────────────────────────────────
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
      userDataCausesReplacement: true, // ← forces replacement when userdata changes
    });

    // Boot script: install nc + keep it listening on port 5432
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

    // ── Outputs ───────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "Ec2InstanceId", {
      value: instance.instanceId,
      description: "Dev EC2 Instance ID - for SSM Session Manager access",
      exportName: "DevEc2InstanceId",
    });
    new cdk.CfnOutput(this, "Ec2PrivateIp", {
      value: instance.instancePrivateIp,
      description:
        "Dev EC2 private IP - use as TCP test target from Shared EC2",
      exportName: "DevEc2PrivateIp",
    });
  }
}

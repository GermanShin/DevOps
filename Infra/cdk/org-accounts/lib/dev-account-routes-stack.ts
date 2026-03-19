import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export interface DevRoutesStackProps extends cdk.StackProps {
  sharedVpcCidr: string; // Shared account VPC CIDR — route destination
  devRouteTableId: string; // Dev private subnet route table ID (from DevStack output)
  peeringConnectionId: string; // Peering connection ID (from SharedStack output)
}

/**
 * Dev Routes Stack
 *
 * Adds the return route in the Dev account's private subnet so that
 * traffic destined for the Shared account VPC is forwarded via peering.
 *
 * Must be deployed LAST — depends on the peering connection ID which is
 * only available after SharedStack is deployed.
 *
 * Deploy THIRD:
 *   cdk deploy DevRoutesStack \
 *     --context devRouteTableId=<DevStack.PrivateRouteTableId> \
 *     --context peeringConnectionId=<SharedStack.PeeringConnectionId> \
 *     --profile dev
 */
export class DevRoutesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DevRoutesStackProps) {
    super(scope, id, props);

    // Return route: Dev private subnet -> Shared account VPC CIDR via peering
    new ec2.CfnRoute(this, "RouteToShared", {
      routeTableId: props.devRouteTableId,
      destinationCidrBlock: props.sharedVpcCidr,
      vpcPeeringConnectionId: props.peeringConnectionId,
    });

    new cdk.CfnOutput(this, "RouteAdded", {
      value: `Route to ${props.sharedVpcCidr} via ${props.peeringConnectionId} added to Dev VPC`,
      description:
        "Confirms the return route was successfully added to Dev VPC",
    });
  }
}

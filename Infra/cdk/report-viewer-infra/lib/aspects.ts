import { IAspect, Annotations } from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { IConstruct } from "constructs";

/**
 * Rejects any S3 bucket that does NOT have all blockPublicAccess settings enabled.
 * All buckets in this stack must explicitly block public access.
 */
export class NoPublicAccessBlockAspect implements IAspect {
  visit(node: IConstruct): void {
    if (node instanceof s3.CfnBucket) {
      const block = node.publicAccessBlockConfiguration as any;
      const fullyBlocked =
        block?.blockPublicAcls &&
        block?.blockPublicPolicy &&
        block?.ignorePublicAcls &&
        block?.restrictPublicBuckets;

      if (!fullyBlocked) {
        Annotations.of(node).addError(
          `[Policy] S3 bucket "${node.logicalId}" has public access enabled. ` +
            `All buckets must set blockPublicAccess: BlockPublicAccess.BLOCK_ALL.`
        );
      }
    }
  }
}

/**
 * Rejects any NAT Gateway in the stack.
 * This stack uses public subnets only to avoid NAT Gateway costs.
 */
export class NoNatGatewayAspect implements IAspect {
  visit(node: IConstruct): void {
    if (node instanceof ec2.CfnNatGateway) {
      Annotations.of(node).addError(
        `[Policy] NAT Gateway "${node.logicalId}" is not allowed in this stack. ` +
          `Use public subnets only (natGateways: 0).`
      );
    }
  }
}

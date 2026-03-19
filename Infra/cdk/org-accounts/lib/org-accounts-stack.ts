import * as cdk from "aws-cdk-lib";
import { aws_organizations as org } from "aws-cdk-lib";
import { Construct } from "constructs";

export class OrgAccountsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create an Organizational Unit (OU)
    const dsOU = new org.CfnOrganizationalUnit(this, "dsOU", {
      name: "Development",
      parentId: "r-vlf4", // ← replace with your Root ID from: aws organizations list-roots
    });

    // Create Dev account
    const devAccount = new org.CfnAccount(this, "DevAccount", {
      accountName: "ds-dev-account",
      email: "germanshin1217+dev@gmail.com", // ← must be a unique email globally
      parentIds: [dsOU.attrId],
      roleName: "OrganizationAccountAccessRole",
    });

    // Create Prod account
    const prodAccount = new org.CfnAccount(this, "ProdAccount", {
      accountName: "ds-prod-account",
      email: "germanshin1217+prod@gmail.com", // ← must be a unique email globally
      parentIds: [dsOU.attrId],
      roleName: "OrganizationAccountAccessRole",
    });

    // Create Shared account
    const sharedAccount = new org.CfnAccount(this, "SharedAccount", {
      accountName: "ds-shared-account",
      email: "germanshin1217+shared@gmail.com", // ← must be a unique email globally
      parentIds: [dsOU.attrId],
      roleName: "OrganizationAccountAccessRole",
    });
  }
}

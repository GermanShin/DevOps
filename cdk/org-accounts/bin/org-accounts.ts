#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { OrgAccountsStack } from "../lib/org-accounts-stack";
import { DevAccountStack } from "../lib/dev-account-stack";
import { SharedAccountStack } from "../lib/shared-account-stack";

const app = new cdk.App();

new OrgAccountsStack(app, "OrgAccountsStack", {});

const ACCOUNTS = {
  shared: { account: "890336468788", region: "ap-southeast-2" },
  dev: { account: "409749468395", region: "ap-southeast-2" },
};

const devStack = new DevAccountStack(app, "DevAccountStack", {
  env: ACCOUNTS.dev,
});

new SharedAccountStack(app, "SharedAccountStack", {
  env: ACCOUNTS.shared,
  devVpcCidr: devStack.vpcCidr,
  devAccountId: ACCOUNTS.dev.account,
  devVpcId: "vpc-023d07c3358c89363",
  devPeeringRoleArn: `arn:aws:iam::${ACCOUNTS.dev.account}:role/ds-vpc-peering-role`,
});

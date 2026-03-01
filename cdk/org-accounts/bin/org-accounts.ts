#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { OrgAccountsStack } from "../lib/org-accounts-stack";
import { DevAccountStack } from "../lib/dev-account-stack";
import { SharedAccountStack } from "../lib/shared-account-stack";

const app = new cdk.App();
new OrgAccountsStack(app, "OrgAccountsStack", {});
new DevAccountStack(app, "DevAccountStack", {});
new SharedAccountStack(app, "SharedAccountStack", {
  devVpcCidr: "10.1.0.0/16",
});

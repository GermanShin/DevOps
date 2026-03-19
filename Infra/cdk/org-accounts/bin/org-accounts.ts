#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { SharedStack } from "../lib/shared-account-stack";
import { DevStack } from "../lib/dev-account-stack";
//import { OrgAccountsStack } from "../lib/org-account-stack";

const app = new cdk.App();

const config = {
  sharedAccountId: "890336468788",
  devAccountId: "409749468395",
  orgAccountId: "484907527321", // ← fill in
  region: "ap-southeast-2",

  sharedVpcCidr: "10.1.0.0/16",
  devVpcCidr: "10.2.0.0/16",
  orgVpcCidr: "10.3.0.0/16", // ← must not overlap
  orgId: "o-zj6n8y1bhd",
};

// ── STEP 1: Deploy first — creates TGW and RAM share ─────────────────────────
// cdk deploy SharedStack --profile ds-shared
new SharedStack(app, "SharedStack", {
  env: { account: config.sharedAccountId, region: config.region },
  sharedVpcCidr: config.sharedVpcCidr,
  devVpcCidr: config.devVpcCidr,
  orgVpcCidr: config.orgVpcCidr,
  devAccountId: config.devAccountId,
  orgAccountId: config.orgAccountId,
  orgId: config.orgId,
});

// ── STEP 2: Deploy after SharedStack outputs are known ────────────────────────
// cdk deploy DevStack --profile ds-dev --context transitGatewayId=tgw-0d5f6de01b696b1cd
new DevStack(app, "DevStack", {
  env: { account: config.devAccountId, region: config.region },
  devVpcCidr: config.devVpcCidr,
  sharedVpcCidr: config.sharedVpcCidr,
  orgVpcCidr: config.orgVpcCidr,
  sharedAccountId: config.sharedAccountId,
  transitGatewayId:
    app.node.tryGetContext("transitGatewayId") ?? "FILL_AFTER_STEP1",
});

// // ── STEP 3: Deploy after SharedStack outputs are known ────────────────────────
// // cdk deploy OrgStack --profile ds-org
// new OrgStack(app, "OrgStack", {
//   env: { account: config.orgAccountId, region: config.region },
//   orgVpcCidr: config.orgVpcCidr,
//   sharedVpcCidr: config.sharedVpcCidr,
//   devVpcCidr: config.devVpcCidr,
//   sharedAccountId: config.sharedAccountId,
//   // ↓ From SharedStack outputs after Step 1
//   transitGatewayId:
//     app.node.tryGetContext("transitGatewayId") ?? "FILL_AFTER_STEP1",
// });

app.synth();

#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { OrgAccountsStack } from "../lib/org-accounts-stack";
import { DevStack } from "../lib/dev-account-stack";
import { SharedStack } from "../lib/shared-account-stack";
import { DevRoutesStack } from "../lib//dev-account-routes-stack";

const app = new cdk.App();

new OrgAccountsStack(app, "OrgAccountsStack", {});

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION — fill these in before deploying
// ─────────────────────────────────────────────────────────────────────────────
const config = {
  sharedAccountId: "890336468788", // Shared account ID (requester / test client)
  devAccountId: "409749468395", // Dev account ID    (accepter / test listener)
  region: "ap-southeast-2", // Deploy region (both accounts)

  sharedVpcCidr: "10.1.0.0/16", // Shared account VPC CIDR — must NOT overlap devVpcCidr
  devVpcCidr: "10.2.0.0/16", // Dev account VPC CIDR    — must NOT overlap sharedVpcCidr
};
// ─────────────────────────────────────────────────────────────────────────────

// ── STEP 1: Deploy this first ─────────────────────────────────────────────────
// cdk deploy DevStack --profile dev
new DevStack(app, "DevStack", {
  env: { account: config.devAccountId, region: config.region },
  devVpcCidr: config.devVpcCidr,
  sharedVpcCidr: config.sharedVpcCidr, // Allow inbound TCP 5432 from Shared account
  sharedAccountId: config.sharedAccountId,
});

// ── STEP 2: Deploy after DevStack outputs are known ───────────────────────────
// Fill in devVpcId & peeringRoleArn from DevStack outputs, then:
// cdk deploy SharedStack --profile shared
new SharedStack(app, "SharedStack", {
  env: { account: config.sharedAccountId, region: config.region },
  sharedVpcCidr: config.sharedVpcCidr,
  devVpcCidr: config.devVpcCidr,
  devAccountId: config.devAccountId,
  // ↓ Fill these from DevStack outputs after Step 1
  devVpcId: app.node.tryGetContext("devVpcId") ?? "FILL_AFTER_STEP1",
  peeringRoleArn:
    app.node.tryGetContext("peeringRoleArn") ?? "FILL_AFTER_STEP1",
  peerRegion: config.region,
});

// ── STEP 3: Add return route on Dev side using the peering connection ID ──────
// Fill in devRouteTableId & peeringConnectionId from outputs, then:
// cdk deploy DevRoutesStack --profile dev
new DevRoutesStack(app, "DevRoutesStack", {
  env: { account: config.devAccountId, region: config.region },
  sharedVpcCidr: config.sharedVpcCidr,
  // ↓ Fill these from DevStack + SharedStack outputs after Steps 1 & 2
  devRouteTableId:
    app.node.tryGetContext("devRouteTableId") ?? "FILL_AFTER_STEP1",
  peeringConnectionId:
    app.node.tryGetContext("peeringConnectionId") ?? "FILL_AFTER_STEP2",
});

app.synth();

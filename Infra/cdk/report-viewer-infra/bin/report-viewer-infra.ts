#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { Aspects } from "aws-cdk-lib";
import { ReportViewerInfraStack } from "../lib/report-viewer-infra-stack";
import { GlobalStack } from "../lib/global-stack";
import { GLOBAL_CONFIG } from "../lib/config";
import { CONFIG } from "../lib/config";
import {
  NoPublicAccessBlockAspect,
  NoNatGatewayAspect,
} from "../lib/aspects";

const app = new cdk.App();

const global = app.node.tryGetContext("global") !== "false";

// const account = process.env.CDK_DEFAULT_ACCOUNT!;
// const region = process.env.CDK_DEFAULT_REGION!;

if (global) {
  const gcfg = GLOBAL_CONFIG;
  const env = { account: gcfg.account, region: gcfg.region };
  // Global stack for certificates in us-east-1
  new GlobalStack(app, "GlobalStack", {
    env,
    gcfg,
  });
} else {
  const cfg = CONFIG;
  const env = { account: cfg.account, region: cfg.region };
  const stack = new ReportViewerInfraStack(app, "ReportViewerInfraStack", {
    env,
    cfg,
  });

  Aspects.of(stack).add(new NoPublicAccessBlockAspect());
  Aspects.of(stack).add(new NoNatGatewayAspect());
}

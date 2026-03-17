// bin/app.ts
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ENV_CONFIG, AppEnv } from "../lib/config";
import { NetworkStack } from "../lib/stacks/network-stack";
import { RdsStack } from "../lib/stacks/rds-stack"; // uncomment in Phase 3
// import { EcsStack }  from '../lib/ecs-stack';   // uncomment in Phase 4

const app = new cdk.App();

// Read target environment from CLI context: cdk deploy -c env=dev
const envName = (app.node.tryGetContext("env") ?? "dev") as AppEnv;
const cfg = ENV_CONFIG[envName];

if (!cfg) {
  // Change this line in app.ts
  throw new Error(`Unknown environment "${envName}". Valid values: dev`);
}

// Stack IDs are prefixed with the environment name — e.g. "dev-NetworkStack"
// This means all three environments can exist in the same CDK app without collision
const prefix = cfg.envName.toUpperCase();

const net = new NetworkStack(app, `${prefix}-NetworkStack`, {
  env: { account: cfg.account, region: cfg.region },
  cfg,
});

if (cfg.envName !== "shared") {
  const rds = new RdsStack(app, `${prefix}-RdsStack`, {
    env: { account: cfg.account, region: cfg.region },
    cfg,
    vpc: net.vpc,
    rdsSg: net.rdsSg,
  });
}

// const ecs = new EcsStack(app, `${prefix}-EcsStack`, { env, cfg, vpc: net.vpc, ...});

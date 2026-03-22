import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ENV_CONFIG, AppEnv } from "../lib/config";
import { NetworkStack } from "../lib/stacks/network-stack";
import { RdsStack } from "../lib/stacks/rds-stack";
import { EcsStack } from "../lib/stacks/ecs-stack";
import { CicdStack } from "../lib/stacks/cicd-stack";
import { DnsStack } from "../lib/stacks/dns-stack";
import { MonitoringStack } from "../lib/stacks/monitoring-stack";

const app = new cdk.App();
const envName = (app.node.tryGetContext("env") ?? "dev") as AppEnv;
const cfg = ENV_CONFIG[envName];

if (!cfg) {
  throw new Error(
    `Unknown environment "${envName}". Valid values: dev | shared | prod`
  );
}

const prefix = cfg.envName.toUpperCase();
const env = { account: cfg.account, region: cfg.region };

// ── Network Stack — always deployed first ──────────────────────────
const net = new NetworkStack(app, `${prefix}-NetworkStack`, { env, cfg });

// ── Guard — SGs only exist for non-shared environments ────────────
if (cfg.envName !== "shared" && (!net.albSg || !net.ecsSg || !net.rdsSg)) {
  throw new Error(
    `Security groups not initialised for env: ${cfg.envName}. ` +
      `Check NetworkStack conditional logic.`
  );
}

// ── Non-shared environments only ──────────────────────────────────
if (cfg.envName !== "shared") {
  // ── RDS Stack ────────────────────────────────────────────────────
  // Deploy with RDS:    cdk deploy -c env=dev -c withRds=true  --profile ds-dev
  // Deploy without RDS: cdk deploy -c env=dev -c withRds=false --profile ds-dev
  const withRds = app.node.tryGetContext("withRds") !== "false";

  let _rdsStack: RdsStack | undefined;
  if (withRds) {
    _rdsStack = new RdsStack(app, `${prefix}-RdsStack`, {
      env,
      cfg,
      vpc: net.vpc,
      rdsSg: net.rdsSg,
    });
  }

  // ── ECS Stack ────────────────────────────────────────────────────
  const _ecsStack = new EcsStack(app, `${prefix}-EcsStack`, {
    env,
    cfg,
    vpc: net.vpc,
    albSg: net.albSg,
    ecsSg: net.ecsSg,
    db: _rdsStack?.db,
    dbSecret: _rdsStack?.dbSecret,
    certArn: cfg.certArn,
  });

  // ── CI/CD Stack ──────────────────────────────────────────────────
  const _cicdStack = new CicdStack(app, `${prefix}-CicdStack`, {
    env,
    cfg,
    service: _ecsStack.service,
    repo: _ecsStack.repo,
  });

  // ── DNS Stack — Deploy 1: creates ACM cert + A record ────────────
  // Deploy 2: uncomment certArn in EcsStack above once cert is ISSUED
  const _dnsStack = new DnsStack(app, `${prefix}-DnsStack`, {
    env,
    cfg,
    alb: _ecsStack.alb,
  });

  // ── Monitoring Stack ─────────────────────────────────────────────
  // Requires RDS — only instantiate when withRds is true
  if (withRds && _rdsStack) {
    const _monitoringStack = new MonitoringStack(
      app,
      `${prefix}-MonitoringStack`,
      {
        env,
        cfg,
        service: _ecsStack.service,
        alb: _ecsStack.alb,
        db: _rdsStack.db,
      }
    );
  }
}

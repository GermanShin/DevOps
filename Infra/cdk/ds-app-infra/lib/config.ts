const vpcCidrConfig = {
  shared: "10.0.0.0/16",
  dev: "10.1.0.0/16",
  prod: "10.2.0.0/16",
};

export type AppEnv = "dev" | "shared" | "prod";

export interface EnvConfig {
  envName: AppEnv;
  orgId: string;
  orgAccountId: string;
  account: string; // AWS account ID for this environment
  region: string;
  profile: string; // SSO profile name
  natGateways: number; // 1 for dev/uat, 2 for prod
  maxAzs: number;

  // ── RDS ─────────────────────────────────────────────────
  rdsInstanceClass: string;
  rdsPostgresVersion: string; // e.g. "16.3"
  rdsMultiAz: boolean;
  rdsBackupRetentionDays: number;
  rdsAllocatedStorage: number; // initial GB
  rdsMaxAllocatedStorage: number; // autoscaling ceiling GB
  rdsDatabaseName: string; // initial DB name inside the instance
  rdsBackupWindow: string; // UTC "HH:MM-HH:MM"
  rdsMaintenanceWindow: string; // UTC "ddd:HH:MM-ddd:HH:MM"
  rdsSnapshotOnDeploy: boolean; // take manual snapshot after provisioning

  // ── ECS (Phase 4) ─────────────────────────────────────────────────
  ecsMinTasks: number;
  ecsMaxTasks: number;
  ecsCpu: number; // 256 for dev
  ecsMemory: number; // 512 for dev
  ecsAppPort: number; // Spring Boot port

  githubConnectionArn: string;
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;

  vpcCidr: string;
  tgwConfig: { sharedVpcCidr: string; devVpcCidr: string };
  transitGatewayId: string;
}

export const ENV_CONFIG: Record<AppEnv, EnvConfig> = {
  shared: {
    envName: "shared",
    orgId: "o-zj6n8y1bhd",
    orgAccountId: "484907527321",
    account: "890336468788", // ds-shared account ID
    region: "ap-southeast-2",
    profile: "ds-shared",
    natGateways: 0,
    maxAzs: 1,
    rdsInstanceClass: "",
    rdsPostgresVersion: "", // e.g. "16.3"
    rdsMultiAz: false, // save cost in dev
    rdsBackupRetentionDays: 1,
    rdsAllocatedStorage: 20,
    rdsMaxAllocatedStorage: 100,
    rdsDatabaseName: "dsapp",
    rdsBackupWindow: "17:00-18:00", // UTC = 3am-4am Sydney
    rdsMaintenanceWindow: "sun:18:00-sun:19:00", // UTC = after backup window
    rdsSnapshotOnDeploy: true,

    // ── ECS ──────────────────────────────────────────────────────────
    ecsMinTasks: 0,
    ecsMaxTasks: 0,
    ecsCpu: 0,
    ecsMemory: 0,
    ecsAppPort: 0,

    githubConnectionArn: "",
    githubOwner: "",
    githubRepo: "",
    githubBranch: "",

    vpcCidr: vpcCidrConfig.shared,
    tgwConfig: { sharedVpcCidr: "", devVpcCidr: vpcCidrConfig.dev },
    transitGatewayId: "",
  },
  dev: {
    envName: "dev",
    orgId: "",
    orgAccountId: "",
    account: "409749468395", // ds-dev account ID
    region: "ap-southeast-2",
    profile: "ds-dev",
    natGateways: 1,
    maxAzs: 2,
    rdsInstanceClass: "t4g.micro",
    rdsPostgresVersion: "16.13",
    rdsMultiAz: false, // save cost in dev
    rdsBackupRetentionDays: 1,
    rdsAllocatedStorage: 20,
    rdsMaxAllocatedStorage: 100,
    rdsDatabaseName: "dsapp",
    rdsBackupWindow: "17:00-18:00", // UTC = 3am-4am Sydney
    rdsMaintenanceWindow: "sun:18:00-sun:19:00", // UTC = after backup window
    rdsSnapshotOnDeploy: true,

    // ── ECS ──────────────────────────────────────────────────────────
    ecsMinTasks: 1,
    ecsMaxTasks: 4,
    ecsCpu: 256,
    ecsMemory: 512,
    ecsAppPort: 8080,

    githubConnectionArn:
      "arn:aws:codeconnections:ap-southeast-2:409749468395:connection/0ae70a18-adfe-4072-be3e-41f7f56dc21e",
    githubOwner: "GermanShin",
    githubRepo: "DevOps",
    githubBranch: "main",

    vpcCidr: vpcCidrConfig.dev,
    tgwConfig: { sharedVpcCidr: vpcCidrConfig.shared, devVpcCidr: "" },
    transitGatewayId: "tgw-0beb286f4f4669b30",
  },
  prod: {
    envName: "prod",
    orgId: "",
    orgAccountId: "",
    account: "",
    region: "ap-southeast-2",
    profile: "ds-prod",
    natGateways: 2,
    maxAzs: 2,
    rdsInstanceClass: "t4g.micro",
    rdsPostgresVersion: "16.13",
    rdsMultiAz: false,
    rdsBackupRetentionDays: 1,
    rdsAllocatedStorage: 20,
    rdsMaxAllocatedStorage: 100,
    rdsDatabaseName: "dsapp",
    rdsBackupWindow: "17:00-18:00", // UTC = 3am-4am Sydney
    rdsMaintenanceWindow: "sun:18:00-sun:19:00", // UTC = after backup window
    rdsSnapshotOnDeploy: true,

    // ── ECS ──────────────────────────────────────────────────────────
    ecsMinTasks: 1,
    ecsMaxTasks: 4,
    ecsCpu: 256,
    ecsMemory: 512,
    ecsAppPort: 8080,

    githubConnectionArn:
      "arn:aws:codeconnections:ap-southeast-2:409749468395:connection/0ae70a18-adfe-4072-be3e-41f7f56dc21e",
    githubOwner: "GermanShin",
    githubRepo: "DevOps",
    githubBranch: "main",

    vpcCidr: vpcCidrConfig.prod,
    tgwConfig: { sharedVpcCidr: "", devVpcCidr: "" },
    transitGatewayId: "",
  },
};

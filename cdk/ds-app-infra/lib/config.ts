const vpcCidrConfig = {
  shared: "10.0.0.0/16",
  dev: "10.1.0.0/16",
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

  // ── ECS ─────────────────────────────────────────────────
  ecsMinTasks: number;
  ecsMaxTasks: number;
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

    ecsMinTasks: 1,
    ecsMaxTasks: 4,
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
    natGateways: 0,
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
    ecsMinTasks: 1,
    ecsMaxTasks: 4,
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
    natGateways: 0,
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
    ecsMinTasks: 1,
    ecsMaxTasks: 4,
    vpcCidr: vpcCidrConfig.dev,
    tgwConfig: { sharedVpcCidr: "", devVpcCidr: "" },
    transitGatewayId: "",
  },
};

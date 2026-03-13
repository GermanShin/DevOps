// lib/config.ts

export type AppEnv = "dev";

export interface EnvConfig {
  envName: AppEnv;
  account: string; // AWS account ID for this environment
  region: string;
  profile: string; // SSO profile name
  natGateways: number; // 1 for dev/uat, 2 for prod
  rdsInstanceClass: string;
  rdsMultiAz: boolean;
  ecsMinTasks: number;
  ecsMaxTasks: number;
}

export const ENV_CONFIG: Record<AppEnv, EnvConfig> = {
  dev: {
    envName: "dev",
    account: "409749468395", // ds-dev account ID
    region: "ap-southeast-2",
    profile: "ds-dev",
    natGateways: 1,
    rdsInstanceClass: "db.t4g.micro",
    rdsMultiAz: false, // save cost in dev
    ecsMinTasks: 1,
    ecsMaxTasks: 4,
  },
  //   ,
  //   uat: {
  //     envName: "uat",
  //     account: "222233334444", // ds-uat account ID (future)
  //     region: "us-east-1",
  //     profile: "ds-uat",
  //     natGateways: 1,
  //     rdsInstanceClass: "db.t3.medium",
  //     rdsMultiAz: false,
  //     ecsMinTasks: 2,
  //     ecsMaxTasks: 6,
  //   },
  //   prod: {
  //     envName: "prod",
  //     account: "555566667777", // ds-prod account ID (future)
  //     region: "us-east-1",
  //     profile: "ds-prod",
  //     natGateways: 2, // full HA in prod
  //     rdsInstanceClass: "db.t3.large",
  //     rdsMultiAz: true, // mandatory in prod
  //     ecsMinTasks: 2,
  //     ecsMaxTasks: 10,
  //   },
};

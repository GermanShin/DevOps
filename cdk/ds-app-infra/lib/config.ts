const vpcCidrConfig = {
  shared: "10.0.0.0/16",
  dev: "10.1.0.0/16",
};

export type AppEnv = "dev" | "shared";

export interface EnvConfig {
  envName: AppEnv;
  orgId: string;
  orgAccountId: string;
  account: string; // AWS account ID for this environment
  region: string;
  profile: string; // SSO profile name
  natGateways: number; // 1 for dev/uat, 2 for prod
  rdsInstanceClass: string;
  rdsMultiAz: boolean;
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
    rdsInstanceClass: "db.t4g.micro",
    rdsMultiAz: false, // save cost in dev
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
    rdsInstanceClass: "db.t4g.micro",
    rdsMultiAz: false, // save cost in dev
    ecsMinTasks: 1,
    ecsMaxTasks: 4,
    vpcCidr: vpcCidrConfig.dev,
    tgwConfig: { sharedVpcCidr: vpcCidrConfig.shared, devVpcCidr: "" },
    transitGatewayId: "tgw-0efbf5d8ea009ddd0",
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

// ── Global Stack Props ─────────────────────────────────────────────────
const parentDomainName = "shared.ds-shin.com";
const dashboardSub = "slareport";
const loginSub = "slareportlogin";
const dashboardFqdn = `${dashboardSub}.${parentDomainName}`;
const loginFqdn = `${loginSub}.${parentDomainName}`;
const hostedZoneId = "Z0151506X0ZEQ6A3L0NT";
const dummyIpAddress = "192.0.2.1";

const cognitoCustomDomainCertARN =
  "arn:aws:acm:us-east-1:890336468788:certificate/48085772-a85a-4ca9-9cdc-c09e1944abd6";
const cloudFrontCertArn =
  "arn:aws:acm:us-east-1:890336468788:certificate/d35faa3a-db39-4eef-b811-5e60456cc21f";
const cognitoCloudFrontFqdn = "d2qpq62vczftwx.cloudfront.net";

export interface GlobalConfig {
  parentDomainName: string;
  dashboardFqdn: string;
  loginFqdn: string;
  account: string;
  region: string;
}

export const GLOBAL_CONFIG: GlobalConfig = {
  parentDomainName: parentDomainName,
  dashboardFqdn: dashboardFqdn,
  loginFqdn: loginFqdn,
  account: "890336468788", // ds-shared account — cert must live in same account as Cognito user pool
  region: "us-east-1", // CloudFront/Cognito custom domain certs must be in us-east-1
};

export interface Config {
  hostedZoneId: string;
  zoneName: string;
  reportBucketName?: string;
  dummyIdAddress: string;
  cognitoCustomDomainCertARN: string;
  account: string;
  region: string;
  loginFqdn: string;
  dashboardFqdn: string;
}

export const CONFIG: Config = {
  hostedZoneId: hostedZoneId,
  zoneName: parentDomainName,
  dummyIdAddress: dummyIpAddress,
  cognitoCustomDomainCertARN: cognitoCustomDomainCertARN,
  account: "890336468788", // ds-shared account ID
  region: "ap-southeast-2",
  loginFqdn: loginFqdn,
  dashboardFqdn: dashboardFqdn,
};

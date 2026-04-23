export interface Config {
  readonly appName: string;
  readonly account: string;
  readonly region: string;
  readonly lambdaVersion: string;
  readonly trafficShift: {
    readonly percentage: number; // % sent to new version in the canary phase
    readonly intervalMinutes: number; // minutes before shifting remaining traffic
  };
}

export const CONFIG: Config = {
  appName: "sam-prototype",
  account: "890336468788", // ds-shared
  region: "ap-southeast-2",
  lambdaVersion: "v1",
  trafficShift: {
    percentage: 10,
    intervalMinutes: 1, // short window for easy testing — change to suit your needs
  },
};

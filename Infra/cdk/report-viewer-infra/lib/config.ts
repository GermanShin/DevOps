export interface Config {
  hostedZoneId: string;
  hostedZoneName: string;
  reportBucketName?: string;
  dummyIdAddress: string;
}

export const CONFIG: Config = {
  hostedZoneId: "Z0151506X0ZEQ6A3L0NT",
  hostedZoneName: "shared.ds-shin.com",
  dummyIdAddress: "192.0.2.1",
};

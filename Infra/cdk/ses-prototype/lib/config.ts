export interface Config {
  readonly appName: string;
  readonly account: string;
  readonly region: string;
  readonly senderEmail: string;
  readonly testRecipientEmail: string;
}

export const CONFIG: Config = {
  appName: "ses-prototype",
  account: "409749468395", // ds-dev
  region: "ap-southeast-2",
  senderEmail: "germanshin1217@gmail.com",
  testRecipientEmail: "jjpssh1203@gmail.com",
};

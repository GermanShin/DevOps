#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SesPrototypeStack } from '../lib/ses-prototype-stack';
import { CONFIG } from '../lib/config';

const app = new cdk.App();

new SesPrototypeStack(app, 'SesPrototypeStack', {
  env: {
    account: CONFIG.account,
    region: CONFIG.region,
  },
  config: CONFIG,
});

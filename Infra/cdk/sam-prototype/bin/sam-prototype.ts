#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SamPrototypeStack } from '../lib/sam-prototype-stack';
import { CONFIG } from '../lib/config';

const app = new cdk.App();

new SamPrototypeStack(app, 'SamPrototypeStack', {
  env: {
    account: CONFIG.account,
    region: CONFIG.region,
  },
  config: CONFIG,
});

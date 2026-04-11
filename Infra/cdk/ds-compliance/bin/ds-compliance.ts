#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { ConfigSetupStack } from "../lib/config-setup-stack";
import { ConfigRulesStack } from "../lib/config-rules-stack";

const app = new cdk.App();

const account = process.env.CDK_DEFAULT_ACCOUNT!;
const region = process.env.CDK_DEFAULT_REGION!;
const env = { account, region };

new ConfigSetupStack(app, "ConfigSetupStack", { env });
new ConfigRulesStack(app, "ConfigRulesStack", { env });

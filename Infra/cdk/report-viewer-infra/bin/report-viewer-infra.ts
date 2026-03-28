#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { ReportViewerInfraStack } from "../lib/report-viewer-infra-stack";
import { CONFIG } from "../lib/config";

const app = new cdk.App();
const cfg = CONFIG;
new ReportViewerInfraStack(app, "ReportViewerInfraStack", { cfg });

#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { ReportViewerInfraStack } from "../lib/report-viewer-infra-stack";

const app = new cdk.App();
new ReportViewerInfraStack(app, "ReportViewerInfraStack", {});

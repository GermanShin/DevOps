import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { SamPrototypeStack } from '../lib/sam-prototype-stack';
import { CONFIG } from '../lib/config';

describe('SamPrototypeStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new SamPrototypeStack(app, 'TestStack', {
      env: { account: CONFIG.account, region: CONFIG.region },
      config: CONFIG,
    });
    template = Template.fromStack(stack);
  });

  test('creates a Lambda function targeting Node.js 22.x', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: `${CONFIG.appName}-api-handler`,
      Runtime: 'nodejs22.x',
    });
  });

  test('creates an HTTP API', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
  });

  test('creates routes for /items and /items/{id}', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Route', 4); // GET+POST /items, GET+DELETE /items/{id}
  });
});

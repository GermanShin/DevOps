import {
  ConfigServiceClient,
  PutEvaluationsCommand,
} from "@aws-sdk/client-config-service";

const configClient = new ConfigServiceClient({});

export const handler = async (event: any): Promise<void> => {
  const invokingEvent = JSON.parse(event.invokingEvent);
  const configurationItem = invokingEvent.configurationItem;

  // Any NAT Gateway that exists is a violation — always NON_COMPLIANT
  await configClient.send(
    new PutEvaluationsCommand({
      Evaluations: [
        {
          ComplianceResourceType: configurationItem.resourceType,
          ComplianceResourceId: configurationItem.resourceId,
          ComplianceType: "NON_COMPLIANT",
          Annotation:
            "NAT Gateways are not allowed. Use public subnets only (natGateways: 0).",
          OrderingTimestamp: new Date(
            configurationItem.configurationItemCaptureTime,
          ),
        },
      ],
      ResultToken: event.resultToken,
    }),
  );
};

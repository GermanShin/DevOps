import { SNSEvent, SNSHandler } from 'aws-lambda';

interface SesMail {
  timestamp: string;
  source: string;
  messageId: string;
  destination: string[];
}

interface SesNotification {
  eventType: string;
  mail: SesMail;
  [key: string]: unknown;
}

export const handler: SNSHandler = async (event: SNSEvent) => {
  for (const record of event.Records) {
    const notification: SesNotification = JSON.parse(record.Sns.Message);
    const { eventType, mail, ...rest } = notification;

    const eventKey = eventType?.toLowerCase();
    const details = rest[eventKey] ?? rest;

    console.log(
      JSON.stringify({
        eventType,
        messageId: mail.messageId,
        source: mail.source,
        destination: mail.destination,
        timestamp: mail.timestamp,
        details,
      })
    );
  }
};

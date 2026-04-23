import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';

const VERSION = process.env.VERSION ?? 'unknown';

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const { method } = event.requestContext.http;
  const id = event.pathParameters?.id;

  if (method === 'GET' && !id) {
    return json(200, { version: VERSION, message: 'List items', items: [] });
  }

  if (method === 'GET' && id) {
    return json(200, { version: VERSION, message: 'Get item', id });
  }

  if (method === 'POST') {
    const body = JSON.parse(event.body ?? '{}');
    return json(201, { version: VERSION, message: 'Item created', id: randomUUID(), ...body });
  }

  if (method === 'DELETE' && id) {
    return json(200, { version: VERSION, message: `Item ${id} deleted` });
  }

  return json(404, { message: 'Not found' });
};

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

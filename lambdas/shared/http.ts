import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { parseId } from './model';

export const response = (
  statusCode: number,
  body: object,
  headers: Record<string, string> = {},
): APIGatewayProxyResult => ({
  statusCode,
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

export const isResponse = (value: unknown): value is APIGatewayProxyResult =>
  typeof value === 'object' && value !== null && 'statusCode' in value;

// Reads a required ID path parameter, or returns a 400 response.
export const pathId = (
  event: APIGatewayProxyEvent,
  name: string,
): number | APIGatewayProxyResult =>
  parseId(event.pathParameters?.[name]) ??
  response(400, { message: `${name} must be a positive integer` });

// Reads an optional ID query parameter: undefined if it's absent, or a 400 response if it's invalid.
export const queryId = (
  event: APIGatewayProxyEvent,
  name: string,
): number | undefined | APIGatewayProxyResult => {
  const value = event.queryStringParameters?.[name];
  if (value === undefined) return undefined;
  return parseId(value) ?? response(400, { message: `${name} must be a positive integer` });
};

// Logs the error for CloudWatch, but keeps its details out of the 500 response.
export const internalError = (err: unknown): APIGatewayProxyResult => {
  console.error('Unexpected error:', err);
  return response(500, { message: 'Internal server error' });
};

// Parses a JSON object request body, or returns a 400 response.
export const parseJsonObject = (
  event: APIGatewayProxyEvent,
): Record<string, unknown> | APIGatewayProxyResult => {
  let body: unknown;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return response(400, { message: 'Request body must be valid JSON' });
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return response(400, { message: 'Request body must be a JSON object' });
  }
  return body as Record<string, unknown>;
};

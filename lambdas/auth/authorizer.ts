import type {
  APIGatewayAuthorizerResult,
  APIGatewayRequestAuthorizerEvent,
} from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

// Created outside the handler so the user pool's JWKS is cached across invocations.
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID!,
  clientId: process.env.CLIENT_ID!,
  tokenUse: 'id',
});

// Verifies the Cognito ID token in the `token` cookie (set by the Auth API's signin)
// and passes the Cognito username to the App API lambdas via the authorizer context.
// A missing, invalid or expired token means the caller isn't signed in, so it throws
// 'Unauthorized', which API Gateway turns into a 401.
export const handler = async (
  event: APIGatewayRequestAuthorizerEvent,
): Promise<APIGatewayAuthorizerResult> => {
  let payload;
  try {
    const token = parseCookies(event.headers?.cookie ?? event.headers?.Cookie)['token'];
    if (!token) throw new Error('No token cookie');
    payload = await verifier.verify(token);
  } catch (err) {
    console.log('Token verification failed:', (err as Error).message);
    throw new Error('Unauthorized');
  }

  const username = payload['cognito:username'];
  return policy(payload.sub, 'Allow', event.methodArn, { username });
};

const parseCookies = (header?: string): Record<string, string> => {
  const cookies: Record<string, string> = {};
  for (const part of header?.split(';') ?? []) {
    const [name, ...value] = part.trim().split('=');
    if (name) cookies[name] = decodeURIComponent(value.join('='));
  }
  return cookies;
};

const policy = (
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context?: Record<string, string>,
): APIGatewayAuthorizerResult => ({
  principalId,
  policyDocument: {
    Version: '2012-10-17',
    Statement: [{ Action: 'execute-api:Invoke', Effect: effect, Resource: resource }],
  },
  context,
});

import type { APIGatewayProxyEvent } from 'aws-lambda';

// Logs "<cognito username>   <request path>[?query]" to CloudWatch, e.g.
//   doconnor   /actors/4321?movie=1234
export const logRequest = (event: APIGatewayProxyEvent): void => {
  // The authorizer lambda adds the Cognito username to the request context. The
  // administrator has no username, so requests made with the API key log as 'admin'.
  const username =
    event.requestContext.authorizer?.username ??
    (event.requestContext.identity?.apiKeyId ? 'admin' : 'anonymous');
  const params = Object.entries(event.queryStringParameters ?? {}).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  const query = params.length ? `?${new URLSearchParams(params)}` : '';
  console.log(`${username}   ${event.path}${query}`);
};

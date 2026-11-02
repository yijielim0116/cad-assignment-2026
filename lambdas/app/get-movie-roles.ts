import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  actorKey,
  ddb,
  getItem,
  isRoleItem,
  movieKey,
  parseId,
  tableName,
  toRole,
} from "../shared/db";
import { internalError, response } from "../shared/http";
import { logRequest } from "../shared/request-logger";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  logRequest(event);

  const movieId = parseId(event.pathParameters?.movieID);
  if (movieId === undefined) {
    return response(400, { message: "movieID must be a positive integer" });
  }

  const actorParam = event.queryStringParameters?.actor;
  const actorId = parseId(actorParam);
  if (actorParam !== undefined && actorId === undefined) {
    return response(400, { message: "actor must be a positive integer" });
  }
  try {
    const [movieItem, actorItem, queryResult] = await Promise.all([
      getItem(movieKey(movieId), movieKey(movieId)),
      actorId === undefined
        ? undefined
        : getItem(actorKey(actorId), actorKey(actorId)),
      // With ?actor=, narrow the query to that actor's role item (SK = a#actorID).
      ddb.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression:
            actorId === undefined ? "PK = :pk" : "PK = :pk AND SK = :sk",
          ExpressionAttributeValues: {
            ":pk": movieKey(movieId),
            ...(actorId !== undefined && { ":sk": actorKey(actorId) }),
          },
        })
      ),
    ]);

    if (!movieItem) {
      return response(404, { message: `Movie ${movieId} not found` });
    }
    if (actorId !== undefined && !actorItem) {
      return response(404, { message: `Actor ${actorId} not found` });
    }
    const resultItems = queryResult.Items ?? [];
    return response(200, { data: resultItems.filter(isRoleItem).map(toRole) });
  } catch (err) {
    return internalError(err);
  }
};

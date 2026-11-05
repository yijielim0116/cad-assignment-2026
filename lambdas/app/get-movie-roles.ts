import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  actorKey,
  ddb,
  getActorItem,
  getMovieItem,
  isRoleItem,
  movieKey,
  tableName,
  toRole,
} from "../shared/db";
import {
  internalError,
  isResponse,
  pathId,
  queryId,
  response,
} from "../shared/http";
import { logRequest } from "../shared/request-logger";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  logRequest(event);

  const movieId = pathId(event, "movieID");
  if (isResponse(movieId)) return movieId;
  const actorId = queryId(event, "actor");
  if (isResponse(actorId)) return actorId;

  try {
    const [movieItem, actorItem, queryResult] = await Promise.all([
      getMovieItem(movieId),
      actorId === undefined ? undefined : getActorItem(actorId),
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

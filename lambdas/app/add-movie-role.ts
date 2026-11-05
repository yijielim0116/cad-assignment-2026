import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { actorKey, ddb, movieKey, type Role, tableName } from "../shared/db";
import {
  internalError,
  isResponse,
  parseJsonObject,
  response,
} from "../shared/http";
import { logRequest } from "../shared/request-logger";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  logRequest(event);

  const body = parseJsonObject(event);
  if (isResponse(body)) return body;

  const problems = [
    !isPositiveId(body.movieId) && "movieId must be a positive integer",
    !isPositiveId(body.actorId) && "actorId must be a positive integer",
    !isText(body.roleName) && "roleName must be a non-empty string",
    !isText(body.roleDescription) && "roleDescription must be a non-empty string",
  ].filter((problem) => problem !== false);
  if (problems.length) {
    return response(400, { message: problems.join("; ") });
  }

  const role: Role = {
    movieId: body.movieId as number,
    actorId: body.actorId as number,
    roleName: (body.roleName as string).trim(),
    roleDescription: (body.roleDescription as string).trim(),
  };

  const movieItemKey = movieKey(role.movieId);
  const actorItemKey = actorKey(role.actorId);
  try {
    // One transaction, so the role is only written if the movie and actor exist
    // and the actor has no role in this movie yet. The checks' order matches
    // the failure responses below.
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            ConditionCheck: {
              TableName: tableName,
              Key: { PK: movieItemKey, SK: movieItemKey },
              ConditionExpression: "attribute_exists(PK)",
            },
          },
          {
            ConditionCheck: {
              TableName: tableName,
              Key: { PK: actorItemKey, SK: actorItemKey },
              ConditionExpression: "attribute_exists(PK)",
            },
          },
          {
            // A role item shares its movie's partition key: m#movieID | a#actorID.
            Put: {
              TableName: tableName,
              Item: { PK: movieItemKey, SK: actorItemKey, ...role },
              ConditionExpression: "attribute_not_exists(PK)",
            },
          },
        ],
      })
    );
    return response(201, { message: "Role added", data: role });
  } catch (err) {
    if (err instanceof TransactionCanceledException) {
      const [movieCheck, actorCheck, roleWrite] = err.CancellationReasons ?? [];
      if (movieCheck?.Code === "ConditionalCheckFailed") {
        return response(404, { message: `Movie ${role.movieId} not found` });
      }
      if (actorCheck?.Code === "ConditionalCheckFailed") {
        return response(404, { message: `Actor ${role.actorId} not found` });
      }
      if (roleWrite?.Code === "ConditionalCheckFailed") {
        return response(409, {
          message: `Actor ${role.actorId} already has a role in movie ${role.movieId}`,
        });
      }
    }
    return internalError(err);
  }
};

// IDs must be real JSON numbers here (unlike path parameters, which are always strings).
const isPositiveId = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

const isText = (value: unknown) =>
  typeof value === "string" && value.trim() !== "";

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
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

  try {
    // A role item shares its movie's partition key: m#movieID | a#actorID.
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: tableName,
              Item: {
                PK: movieKey(role.movieId),
                SK: actorKey(role.actorId),
                ...role,
              },
            },
          },
        ],
      })
    );
    return response(201, { message: "Role added", data: role });
  } catch (err) {
    return internalError(err);
  }
};

// IDs must be real JSON numbers here (unlike path parameters, which are always strings).
const isPositiveId = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

const isText = (value: unknown) =>
  typeof value === "string" && value.trim() !== "";

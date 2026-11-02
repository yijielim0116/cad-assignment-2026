import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  actorKey,
  getItem,
  movieKey,
  parseId,
  toActor,
  toRole,
} from "../shared/db";
import { internalError, response } from "../shared/http";
import { logRequest } from "../shared/request-logger";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  logRequest(event);

  const actorId = parseId(event.pathParameters?.actorID);
  if (actorId === undefined) {
    return response(400, { message: "actorID must be a positive integer" });
  }

  const movieParam = event.queryStringParameters?.movie;
  const movieId = parseId(movieParam);
  if (movieParam !== undefined && movieId === undefined) {
    return response(400, { message: "movie must be a positive integer" });
  }
  try {
    // With ?movie=, also fetch that movie and the actor's role in it, if they have one.
    const [actorItem, movieItem, roleItem] = await Promise.all([
      getItem(actorKey(actorId), actorKey(actorId)),
      movieId === undefined
        ? undefined
        : getItem(movieKey(movieId), movieKey(movieId)),
      movieId === undefined
        ? undefined
        : getItem(movieKey(movieId), actorKey(actorId)),
    ]);

    if (!actorItem) {
      return response(404, { message: `Actor ${actorId} not found` });
    }
    if (movieId !== undefined && !movieItem) {
      return response(404, { message: `Movie ${movieId} not found` });
    }
    const actor = toActor(actorItem);
    const role = roleItem ? toRole(roleItem) : undefined;
    return response(200, { data: { ...actor, role } });
  } catch (err) {
    return internalError(err);
  }
};

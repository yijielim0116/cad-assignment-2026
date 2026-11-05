import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  getActorItem,
  getMovieItem,
  getRoleItem,
  toActor,
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

  const actorId = pathId(event, "actorID");
  if (isResponse(actorId)) return actorId;
  const movieId = queryId(event, "movie");
  if (isResponse(movieId)) return movieId;

  try {
    // With ?movie=, also fetch that movie and the actor's role in it, if they have one.
    const [actorItem, movieItem, roleItem] = await Promise.all([
      getActorItem(actorId),
      movieId === undefined ? undefined : getMovieItem(movieId),
      movieId === undefined ? undefined : getRoleItem(movieId, actorId),
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

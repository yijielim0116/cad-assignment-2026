import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { actorKey, movieKey } from './model';

export const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.REGION }),
  { marshallOptions: { removeUndefinedValues: true } },
);
export const tableName = process.env.TABLE_NAME!;

// Gets the item with these keys, or undefined if there isn't one.
export const getItem = async (pk: string, sk: string) => {
  const { Item } = await ddb.send(new GetCommand({ TableName: tableName, Key: { PK: pk, SK: sk } }));
  return Item;
};

// One getter per item type, so the single-table key layout lives in one place.
export const getMovieItem = (movieId: number) => getItem(movieKey(movieId), movieKey(movieId));
export const getActorItem = (actorId: number) => getItem(actorKey(actorId), actorKey(actorId));
export const getRoleItem = (movieId: number, actorId: number) =>
  getItem(movieKey(movieId), actorKey(actorId));

export * from './model';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

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

export * from './model';

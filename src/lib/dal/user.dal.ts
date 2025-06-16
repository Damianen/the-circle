"use server";
import "server-only";

import { cache } from "react";
import { User } from "@/lib/models/user.interface";
import { verifySession } from "./dal";
import { database } from "../dal/dao/db-config";
import * as sql from "mssql"; //mongodb moet gebruikt worden
import { createSession, deleteSession } from "../session";

export const getCurrentUser = cache(async (): Promise<User | undefined> => {
  const session = await verifySession();
  if (!session) return undefined;

  return getUser(String(session.userName));
});

export const getUserName = cache(async (): Promise<string | undefined> => {
  const session = await verifySession();
  if (!session) return undefined;

  return String(session.userName);
});

export const getUser = async (
  userName: string,
  tokenFromApi?: string
): Promise<User | undefined> => {
  const session =
    (await verifySession(tokenFromApi)) || (await verifySession());
  if (!session) return undefined;

  try {
    if (!database.connected) {
      await database.connect();
    }

    const sqlRequest: sql.Request = database.request();

    sqlRequest.input("userName", sql.NVarChar, userName);

    const results = await sqlRequest.query(
      "SELECT * FROM [User] WHERE userName = @userName"
    );

    await database.close();

    const user: User = results.recordset[0] ? results.recordset[0] : undefined;

    if (user) {
      user.birthdate = new Date(user.birthdate);
      return user;
    } else {
      console.log("User not found!");
      return undefined;
    }
  } catch (error) {
    console.log("Failed to fetch user");
    console.log(error);
    return undefined;
  }
};

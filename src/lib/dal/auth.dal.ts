"use server";
import "server-only";

import { User } from "@/lib/models/user.interface";
import { database } from "../dal/dao/db-config";
import * as sql from "mssql"; //mongodb moet gebruikt worden
import { compareSync, genSaltSync, hashSync } from "bcrypt-ts";

export const login = async (
  userName: string,
  password: string
): Promise<any> => {
  try {
    if (!database.connected) {
      await database.connect();
    }

    const sqlRequest: sql.Request = database.request();

    sqlRequest.input("userName", sql.NVarChar, userName);

    const results = await sqlRequest.query(
      "SELECT userName, password FROM [User] WHERE userName=@userName"
    );

    await database.close();

    if (results.recordset.length == 0) {
      return { error: "Gebruiker niet gevonden!" };
    } else if (!compareSync(password, results.recordset[0].password)) {
      return { error: "Wachtwoord is incorrect!" };
    }
    return { succes: true };
  } catch (err: unknown) {
    let errorMessage = "An unexpected error occurred";
    if (err instanceof Error) {
      errorMessage = err.message;
    }
    return { error: errorMessage };
  }
};

export const register = async (data: User): Promise<any> => {
  try {
    const salt = genSaltSync(10);
    const hash = hashSync(data.password, salt);

    data.birthdate.setHours(data.birthdate.getHours() + 1); //offset timezone GMT+1
    const formatedDate = data.birthdate.toISOString();

    if (data.birthdate > new Date())
      return { error: "Verjaardag kan niet in de toekomst liggen!" };

    if (!database.connected) {
      await database.connect();
    }

    const checkEmail: sql.Request = database.request();
    checkEmail.input("email", sql.NVarChar, data.email);
    const emailCheck = await checkEmail.query(
      "SELECT email FROM [User] WHERE email=@email"
    );
    if (emailCheck.recordset.length > 0) {
      await database.close();
      return { error: "Email staat al geregistreerd!" };
    }

    const checkUserName: sql.Request = database.request();
    checkUserName.input("userName", sql.NVarChar, data.userName);
    const userNameCheck = await checkUserName.query(
      "SELECT email FROM [User] WHERE userName=@userName"
    );
    if (userNameCheck.recordset.length > 0) {
      await database.close();
      return { error: "Gebruikersnaam is al in gebruik!" };
    }

    const sqlRequest: sql.Request = database.request();
    sqlRequest.input("email", sql.NVarChar, data.email);
    sqlRequest.input("userName", sql.NVarChar, data.userName);
    sqlRequest.input("firstName", sql.NVarChar, data.firstName);
    sqlRequest.input("lastName", sql.NVarChar, data.lastName);
    sqlRequest.input("password", sql.NVarChar, hash);
    sqlRequest.input("birthdate", sql.Date, formatedDate);

    await sqlRequest.query(
      `INSERT INTO [User]([email],[userName],[firstName],[lastName],[password],[birthdate])
			VALUES(@email ,@userName,@firstName,@lastName,@password, @birthdate)`
    );
    await database.close();

    return { succes: true };
  } catch (err: unknown) {
    let errorMessage = "An unexpected error occurred";
    if (err instanceof Error) {
      errorMessage = err.message;
    }
    return { error: errorMessage };
  }
};

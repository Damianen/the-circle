export interface IUser {
	email: string;
	firstName: string;
	lastName: string;
	userName: string;
	password: string;
	birthdate: Date;
	profilePicture?: string;
}

export class User implements IUser {
	constructor() {}

	email!: string;
	firstName!: string;
	lastName!: string;
	userName!: string;
	password!: string;
	birthdate!: Date;
	profilePicture?: string;
}
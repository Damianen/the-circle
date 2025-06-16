import { z } from 'zod';

export type LoginFormState =
	| {
			message?: string;
			error?: string;
	  }
	| undefined;

'use server';
import 'server-only';

import { decrypt } from '@/lib/session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

export const verifySession = cache(async (tokenFromApi?: string) => {
    const token = tokenFromApi || (await getToken()); // Use token from API or cookies
    const session = await decrypt(token);

    if (!session) {
        if (!tokenFromApi) {
            redirect('/login');
        }
        return undefined;
    }

    return { isAuth: true, userName: session.userName };
});

export const getToken = cache(async () => {
	return (await cookies()).get('session')?.value;
});
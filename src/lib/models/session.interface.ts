import { JWTPayload } from 'jose';

export interface SessionPayload extends JWTPayload {
    userName: string;
    expiresAt: Date;
}
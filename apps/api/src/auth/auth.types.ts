import type { Request } from 'express';
import type { Role } from '@jogylink/shared';

/** The signed-in person, attached to the request by JwtAuthGuard. Role comes from the database. */
export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: Role;
}

export type AuthedRequest = Request & { user?: AuthUser };

/** What is stored inside the token. Kept minimal: identity only, never permissions. */
export interface JwtPayload {
  sub: string;
}

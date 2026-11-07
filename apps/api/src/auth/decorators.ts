import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Role } from '@jogylink/shared';
import type { AuthedRequest, AuthUser } from './auth.types';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Every route needs a login unless it is marked @Public(). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route (or whole controller) to the listed roles. e.g. @Roles('owner') */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Injects the signed-in user into a controller method. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!request.user) {
      throw new Error('CurrentUser used on a route that is not protected by JwtAuthGuard');
    }
    return request.user;
  },
);

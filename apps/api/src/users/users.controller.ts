import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  CreateUserSchema,
  UpdateUserSchema,
  type CreateUser,
  type UpdateUser,
  type User,
} from '@jogylink/shared';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { UsersService } from './users.service';

/**
 * Screen A14. Owner only, the whole controller.
 * There is deliberately no DELETE: sales and credit entries will point at a user, so an account
 * is switched off with PATCH { active: false } and its history stays intact.
 */
@Roles('owner')
@Controller('users')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  list(): Promise<User[]> {
    return this.users.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(CreateUserSchema)) body: CreateUser): Promise<User> {
    return this.users.create(body);
  }

  /** Rename, change role, deactivate/reactivate, or reset the password. */
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string,
    @Body(new ZodValidationPipe(UpdateUserSchema)) body: UpdateUser,
    @CurrentUser() actor: AuthUser,
  ): Promise<User> {
    return this.users.update(id, body, actor);
  }
}

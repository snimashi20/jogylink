import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { asc, eq } from 'drizzle-orm';
import { users } from '@jogylink/db';
import type { CreateUser, UpdateUser, User } from '@jogylink/shared';
import { toUser } from '../auth/auth.service';
import type { AuthUser } from '../auth/auth.types';
import { isUniqueViolation } from '../common/db-errors';
import { APP_ENV, type Env } from '../config/env';
import { DB, type Db } from '../db/db.module';

/**
 * M1 — user management (A14).
 *
 * Lock-out protection: the owner cannot deactivate or demote their own account. That single rule
 * guarantees at least one active owner always exists (the person making the request), so the
 * business can never be left with nobody able to sign in as owner.
 */
@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  async list(): Promise<User[]> {
    const rows = await this.db.select().from(users).orderBy(asc(users.createdAt), asc(users.name));
    return rows.map(toUser);
  }

  async create(input: CreateUser): Promise<User> {
    const username = input.username.trim().toLowerCase();
    try {
      const [row] = await this.db
        .insert(users)
        .values({
          name: input.name.trim(),
          username,
          passwordHash: await bcrypt.hash(input.password, this.env.BCRYPT_ROUNDS),
          role: input.role,
        })
        .returning();
      return toUser(row!);
    } catch (err) {
      throw this.translate(err, username);
    }
  }

  async update(id: string, input: UpdateUser, actor: AuthUser): Promise<User> {
    const changes: Partial<typeof users.$inferInsert> = {};
    if (input.name !== undefined) changes.name = input.name.trim();
    if (input.role !== undefined) changes.role = input.role;
    if (input.active !== undefined) changes.active = input.active;
    if (input.password !== undefined) {
      changes.passwordHash = await bcrypt.hash(input.password, this.env.BCRYPT_ROUNDS);
    }
    if (Object.keys(changes).length === 0) {
      throw new BadRequestException('Nothing to change. Send at least one field.');
    }

    if (id === actor.id) {
      if (input.active === false) {
        throw new ConflictException('You cannot deactivate your own account.');
      }
      if (input.role !== undefined && input.role !== actor.role) {
        throw new ConflictException('You cannot change your own role.');
      }
    }

    const [row] = await this.db.update(users).set(changes).where(eq(users.id, id)).returning();
    if (!row) throw new NotFoundException('User not found');
    return toUser(row);
  }

  private translate(err: unknown, username: string): unknown {
    if (isUniqueViolation(err)) {
      return new ConflictException(`The username "${username}" is already taken.`);
    }
    return err;
  }
}

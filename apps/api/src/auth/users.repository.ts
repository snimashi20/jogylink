import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { users } from '@jogylink/db';
import { DB, type Db } from '../db/db.module';

export type UserRecord = typeof users.$inferSelect;

/** The only thing the auth code needs from storage. An abstract class so Nest can inject it. */
export abstract class UsersRepository {
  abstract findByUsername(username: string): Promise<UserRecord | null>;
  abstract findById(id: string): Promise<UserRecord | null>;
}

@Injectable()
export class DrizzleUsersRepository extends UsersRepository {
  constructor(@Inject(DB) private readonly db: Db) {
    super();
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const [row] = await this.db.select().from(users).where(eq(users.username, username)).limit(1);
    return row ?? null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  }
}

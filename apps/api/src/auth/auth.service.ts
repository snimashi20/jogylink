import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import type { LoginResponse, User } from '@jogylink/shared';
import type { AuthUser, JwtPayload } from './auth.types';
import { LoginAttemptLimiter } from './login-attempt-limiter';
import { UsersRepository, type UserRecord } from './users.repository';

const INVALID_LOGIN = 'Invalid username or password';

// Compared against when the username does not exist, so "no such user" takes as long as
// "wrong password" and an attacker cannot tell which usernames are real.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export function toUser(row: UserRecord): User {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    active: row.active,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(LoginAttemptLimiter) private readonly limiter: LoginAttemptLimiter,
  ) {}

  async login(username: string, password: string, ip: string): Promise<LoginResponse> {
    const name = username.trim().toLowerCase();
    const key = `${ip}|${name}`;
    this.limiter.assertAllowed(key);

    const row = await this.users.findByUsername(name);
    const passwordOk = await bcrypt.compare(password, row?.passwordHash ?? DUMMY_HASH);

    // One generic message for: unknown user, wrong password, deactivated account.
    if (!row || !passwordOk || !row.active) {
      this.limiter.recordFailure(key);
      throw new UnauthorizedException(INVALID_LOGIN);
    }

    this.limiter.recordSuccess(key);
    const payload: JwtPayload = { sub: row.id };
    return { accessToken: await this.jwt.signAsync(payload), user: toUser(row) };
  }

  /**
   * Checks a token and re-reads the user from the database on every request, so deactivating
   * an account or changing a role takes effect immediately instead of when the token expires.
   */
  async authenticate(token: string): Promise<AuthUser> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    const row = typeof payload.sub === 'string' ? await this.users.findById(payload.sub) : null;
    if (!row || !row.active) throw new UnauthorizedException('Invalid or expired token');
    return { id: row.id, username: row.username, name: row.name, role: row.role };
  }

  async getProfile(userId: string): Promise<User> {
    const row = await this.users.findById(userId);
    if (!row || !row.active) throw new UnauthorizedException('Invalid or expired token');
    return toUser(row);
  }
}

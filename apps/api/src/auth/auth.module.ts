import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { APP_ENV, type Env } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginAttemptLimiter } from './login-attempt-limiter';
import { RolesGuard } from './roles.guard';
import { DrizzleUsersRepository, UsersRepository } from './users.repository';

/**
 * M1 — authentication and role permissions.
 * The two guards are registered GLOBALLY, so every route in every module is private by default.
 * Other members do not need to add anything: use @Public() to open a route, @Roles('owner') to
 * restrict one to the owner.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_SECRET,
        signOptions: { algorithm: 'HS256', expiresIn: env.JWT_EXPIRES_IN_SECONDS },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LoginAttemptLimiter,
    { provide: UsersRepository, useClass: DrizzleUsersRepository },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}

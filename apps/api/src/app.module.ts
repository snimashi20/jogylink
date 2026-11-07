import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { DbModule } from './db/db.module';
import { HealthController } from './health.controller';

@Module({
  imports: [ConfigModule, DbModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule {}

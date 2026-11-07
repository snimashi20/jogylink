import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { DbModule } from './db/db.module';
import { HealthController } from './health.controller';
import { ShopsModule } from './shops/shops.module';

@Module({
  imports: [ConfigModule, DbModule, AuthModule, ShopsModule],
  controllers: [HealthController],
})
export class AppModule {}

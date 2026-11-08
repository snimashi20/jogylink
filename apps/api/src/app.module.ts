import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { DbModule } from './db/db.module';
import { HealthController } from './health.controller';
import { ProductsModule } from './products/products.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [ConfigModule, DbModule, AuthModule, SettingsModule, ProductsModule],
  controllers: [HealthController],
})
export class AppModule {}

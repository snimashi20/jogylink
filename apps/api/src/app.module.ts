import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { DbModule } from './db/db.module';
import { HealthController } from './health.controller';
import { ProductsModule } from './products/products.module';
import { RoutesModule } from './routes/routes.module';
import { SettingsModule } from './settings/settings.module';
import { ShopsModule } from './shops/shops.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule,
    DbModule,
    AuthModule,
    SettingsModule,
    ProductsModule,
    UsersModule,
    ShopsModule,
    RoutesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

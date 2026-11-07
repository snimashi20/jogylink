import { Global, Module } from '@nestjs/common';
import { APP_ENV, loadEnv } from './env';

/** Makes the validated environment available to every module through the APP_ENV token. */
@Global()
@Module({
  providers: [{ provide: APP_ENV, useFactory: () => loadEnv() }],
  exports: [APP_ENV],
})
export class ConfigModule {}

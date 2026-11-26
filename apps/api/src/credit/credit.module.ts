import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { CreditController } from './credit.controller';
import { CreditService } from './credit.service';

/**
 * M6 — the credit ledger.
 *
 * `CreditService` is exported because the sync endpoint posts sales, returns and payments
 * through it when they arrive from the van.
 */
@Module({
  imports: [SettingsModule],
  controllers: [CreditController],
  providers: [CreditService],
  exports: [CreditService],
})
export class CreditModule {}

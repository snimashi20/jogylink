import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  RecordPaymentSchema,
  ShopLedgerQuerySchema,
  type RecordPayment,
  type ShopLedgerQuery,
} from '@jogylink/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CreditService } from './credit.service';

/**
 * M6 — the credit ledger API, for the owner's screens: A9 (credit ledger), A1's two widgets and
 * A12's ageing report.
 *
 * Owner only. Sales, returns and payments taken in the van do not come through here — they
 * arrive as events on `POST /sync` and are posted by `CreditService` in the same transaction as
 * the sale, so there is one path for money from the van and one for the owner's own corrections.
 *
 * There is deliberately no endpoint to edit or delete an entry. The ledger is append-only; a
 * mistake is corrected by posting an adjustment, which leaves the history visible.
 */
@Controller('credit')
@Roles('owner')
export class CreditController {
  constructor(@Inject(CreditService) private readonly credit: CreditService) {}

  /** A1 — total outstanding credit and the overdue count. */
  @Get('summary')
  summary() {
    return this.credit.getSummary();
  }

  /** A12 — the credit ageing report. */
  @Get('ageing')
  ageing() {
    return this.credit.getAgeing();
  }

  /** A9 — one shop's statement. */
  @Get('shops/:shopId')
  shopLedger(
    @Param('shopId', new ParseUUIDPipe()) shopId: string,
    @Query(new ZodValidationPipe(ShopLedgerQuerySchema)) query: ShopLedgerQuery,
  ) {
    return this.credit.getShopLedger(shopId, query);
  }

  /**
   * A9 — record a payment the owner collected.
   *
   * `sourceUuid` is the caller's own id for the payment. Sending the same one again returns the
   * current balance and posts nothing, so a double-tapped button or a retried request cannot
   * credit a shop twice.
   */
  @Post('payments')
  payment(
    @Body(new ZodValidationPipe(RecordPaymentSchema)) body: RecordPayment,
    @CurrentUser() user: AuthUser,
  ) {
    return this.credit.collectPayment(body, user.id);
  }
}

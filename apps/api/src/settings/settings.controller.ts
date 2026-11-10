import { Body, Controller, Get, Inject, NotFoundException, Param, Put } from '@nestjs/common';
import {
  SettingKeySchema,
  UpdateSettingSchema,
  type Setting,
  type UpdateSetting,
} from '@jogylink/shared';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}

  /** Any signed-in user: the POS needs the thresholds too. */
  @Get()
  list(): Promise<Setting[]> {
    return this.settings.getAll();
  }

  @Roles('owner')
  @Put(':key')
  update(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(UpdateSettingSchema)) body: UpdateSetting,
    @CurrentUser() user: AuthUser,
  ): Promise<Setting> {
    const parsed = SettingKeySchema.safeParse(key);
    if (!parsed.success) throw new NotFoundException(`Unknown setting "${key}"`);
    return this.settings.update(parsed.data, body.value, user.id);
  }
}

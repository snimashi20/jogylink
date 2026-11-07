import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ShopCreateSchema,
  ShopListQuerySchema,
  ShopUpdateSchema,
  type ShopCreate,
  type ShopListQuery,
  type ShopUpdate,
} from '@jogylink/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Roles } from '../auth/decorators';
import { ShopsService } from './shops.service';

@Controller('shops')
export class ShopsController {
  constructor(@Inject(ShopsService) private readonly shops: ShopsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(ShopListQuerySchema)) query: ShopListQuery) {
    return this.shops.list(query);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.shops.get(id);
  }

  @Post()
  @Roles('owner')
  create(@Body(new ZodValidationPipe(ShopCreateSchema)) body: ShopCreate) {
    return this.shops.create(body);
  }

  @Patch(':id')
  @Roles('owner')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ShopUpdateSchema)) body: ShopUpdate,
  ) {
    return this.shops.update(id, body);
  }
}

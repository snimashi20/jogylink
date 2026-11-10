import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import type { CreateProduct, PosProduct, Product, UpdateProduct } from '@jogylink/shared';
import { Roles } from '../auth/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CreateProductBody, UpdateProductBody } from './product-bodies';
import { ProductsService } from './products.service';

/**
 * There is deliberately no DELETE: batches and sales will point at products, so a product is
 * switched off with PATCH { active: false } and its history stays intact.
 */
@Controller('products')
export class ProductsController {
  constructor(@Inject(ProductsService) private readonly products: ProductsService) {}

  /** Owner: all products with BOTH prices (screen A2). */
  @Roles('owner')
  @Get()
  list(): Promise<Product[]> {
    return this.products.list();
  }

  /** Any signed-in user: what the POS needs. Wholesale price only. */
  @Get('pos')
  listForPos(): Promise<PosProduct[]> {
    return this.products.listForPos();
  }

  @Roles('owner')
  @Post()
  create(@Body(new ZodValidationPipe(CreateProductBody)) body: CreateProduct): Promise<Product> {
    return this.products.create(body);
  }

  @Roles('owner')
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateProductBody)) body: UpdateProduct,
  ): Promise<Product> {
    return this.products.update(id, body);
  }
}

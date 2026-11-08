import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { products } from '@jogylink/db';
import {
  fromCents,
  resolveRetailPriceCents,
  toCents,
  type CreateProduct,
  type PosProduct,
  type Product,
  type UpdateProduct,
  type WebProduct,
} from '@jogylink/shared';
import { isUniqueViolation } from '../common/db-errors';
import { DB, type Db } from '../db/db.module';
import { SettingsService } from '../settings/settings.service';

type ProductRow = typeof products.$inferSelect;

const money = (cents: number): string => (cents / 100).toFixed(2);
const normaliseSku = (sku: string): string => sku.trim().toUpperCase();

/**
 * M1 — products and the two-price rule.
 *
 * Only the WHOLESALE price is stored. The retail price is worked out here, every time, from
 * wholesale x markup (the product's own override, otherwise the system setting), by the single
 * function in @jogylink/shared. There is no retail column that could drift out of step.
 */
@Injectable()
export class ProductsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {}

  /** Owner view: everything, including inactive products, with both prices. */
  async list(): Promise<Product[]> {
    const [rows, markup] = await Promise.all([this.rows(), this.settings.get('retail_markup')]);
    return rows.map((r) => this.toProduct(r, markup));
  }

  async get(id: string): Promise<Product> {
    const [row] = await this.db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!row) throw new NotFoundException('Product not found');
    return this.toProduct(row, await this.settings.get('retail_markup'));
  }

  /** POS view: active products, WHOLESALE price only. The POS never sees the retail price. */
  async listForPos(): Promise<PosProduct[]> {
    return (await this.rows())
      .filter((r) => r.active)
      .map((r) => ({
        id: r.id,
        sku: r.sku,
        name: r.name,
        unitType: r.unitType,
        wholesalePrice: fromCents(this.wholesaleCents(r)),
      }));
  }

  /** Website view (for M8): active products, RETAIL price only. Wholesale is never published. */
  async listForWeb(): Promise<WebProduct[]> {
    const markup = await this.settings.get('retail_markup');
    return (await this.rows())
      .filter((r) => r.active)
      .map((r) => ({
        id: r.id,
        sku: r.sku,
        name: r.name,
        unitType: r.unitType,
        retailPrice: this.toProduct(r, markup).retailPrice,
      }));
  }

  async create(input: CreateProduct): Promise<Product> {
    try {
      const [row] = await this.db
        .insert(products)
        .values({
          sku: normaliseSku(input.sku),
          name: input.name.trim(),
          unitType: input.unitType,
          wholesalePrice: money(toCents(input.wholesalePrice)),
          retailMarkupOverride:
            input.retailMarkupOverride == null ? null : input.retailMarkupOverride.toFixed(4),
        })
        .returning();
      return this.toProduct(row!, await this.settings.get('retail_markup'));
    } catch (err) {
      throw this.translate(err, input.sku);
    }
  }

  async update(id: string, input: UpdateProduct): Promise<Product> {
    const changes: Partial<typeof products.$inferInsert> = {};
    if (input.sku !== undefined) changes.sku = normaliseSku(input.sku);
    if (input.name !== undefined) changes.name = input.name.trim();
    if (input.unitType !== undefined) changes.unitType = input.unitType;
    if (input.active !== undefined) changes.active = input.active;
    if (input.wholesalePrice !== undefined) {
      changes.wholesalePrice = money(toCents(input.wholesalePrice));
    }
    if (input.retailMarkupOverride !== undefined) {
      // null means "go back to the system-wide markup"
      changes.retailMarkupOverride =
        input.retailMarkupOverride === null ? null : input.retailMarkupOverride.toFixed(4);
    }
    if (Object.keys(changes).length === 0) return this.get(id);

    try {
      const [row] = await this.db
        .update(products)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(products.id, id))
        .returning();
      if (!row) throw new NotFoundException('Product not found');
      return this.toProduct(row, await this.settings.get('retail_markup'));
    } catch (err) {
      throw this.translate(err, input.sku ?? '');
    }
  }

  private rows(): Promise<ProductRow[]> {
    return this.db.select().from(products).orderBy(asc(products.name));
  }

  private wholesaleCents(row: ProductRow): number {
    return toCents(Number(row.wholesalePrice));
  }

  private toProduct(row: ProductRow, defaultMarkup: number): Product {
    const wholesaleCents = this.wholesaleCents(row);
    return {
      id: row.id,
      sku: row.sku,
      name: row.name,
      unitType: row.unitType,
      wholesalePrice: fromCents(wholesaleCents),
      retailMarkupOverride:
        row.retailMarkupOverride === null ? null : Number(row.retailMarkupOverride),
      retailPrice: fromCents(
        resolveRetailPriceCents({
          wholesaleCents,
          defaultMarkup,
          markupOverride: row.retailMarkupOverride,
        }),
      ),
      active: row.active,
    };
  }

  private translate(err: unknown, sku: string): unknown {
    if (isUniqueViolation(err)) {
      return new ConflictException(`A product with SKU "${normaliseSku(sku)}" already exists`);
    }
    return err;
  }
}

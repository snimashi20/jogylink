import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, eq, ilike, or } from 'drizzle-orm';
import { shops } from '@jogylink/db';
import type { ShopCreate, ShopListQuery, ShopResponse, ShopUpdate } from '@jogylink/shared';
import { DB, type Db } from '../db/db.module';

type ShopRecord = typeof shops.$inferSelect;

function toShopResponse(row: ShopRecord): ShopResponse {
  return {
    ...row,
    creditLimit: Number(row.creditLimit),
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('code' in error && error.code === '23505') return true;
  return 'cause' in error && error.cause !== error && isUniqueViolation(error.cause);
}

@Injectable()
export class ShopsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(query: ShopListQuery) {
    const filters = [];
    if (query.active !== undefined) filters.push(eq(shops.isActive, query.active));
    if (query.query) {
      const pattern = `%${query.query}%`;
      filters.push(or(ilike(shops.name, pattern), ilike(shops.code, pattern))!);
    }
    const where = filters.length ? and(...filters) : undefined;
    const offset = (query.page - 1) * query.pageSize;

    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select()
        .from(shops)
        .where(where)
        .orderBy(shops.name, shops.id)
        .limit(query.pageSize)
        .offset(offset),
      this.db.select({ total: count() }).from(shops).where(where),
    ]);

    return {
      items: rows.map(toShopResponse),
      page: query.page,
      pageSize: query.pageSize,
      total: totalRow?.total ?? 0,
    };
  }

  async get(id: string): Promise<ShopResponse> {
    const [row] = await this.db.select().from(shops).where(eq(shops.id, id)).limit(1);
    if (!row) throw new NotFoundException('Shop not found');
    return toShopResponse(row);
  }

  async create(input: ShopCreate): Promise<ShopResponse> {
    try {
      const [row] = await this.db
        .insert(shops)
        .values({
          ...input,
          creditLimit: input.creditLimit.toFixed(2),
          phone: input.phone ?? null,
          address: input.address ?? null,
          locality: input.locality ?? null,
        })
        .returning();
      return toShopResponse(row!);
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('A shop with this code already exists');
      throw error;
    }
  }

  async update(id: string, input: ShopUpdate): Promise<ShopResponse> {
    try {
      const { creditLimit, ...fields } = input;
      const values = {
        ...fields,
        ...(creditLimit === undefined ? {} : { creditLimit: creditLimit.toFixed(2) }),
        updatedAt: new Date(),
      };
      const [row] = await this.db.update(shops).set(values).where(eq(shops.id, id)).returning();
      if (!row) throw new NotFoundException('Shop not found');
      return toShopResponse(row);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      if (isUniqueViolation(error))
        throw new ConflictException('A shop with this code already exists');
      throw error;
    }
  }
}

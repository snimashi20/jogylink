import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, eq, ilike, inArray, or } from 'drizzle-orm';
import { routes, shops } from '@jogylink/db';
import type {
  ReplaceRouteShops,
  RouteCreate,
  RouteDetailResponse,
  RouteListQuery,
  RouteResponse,
  RouteUpdate,
} from '@jogylink/shared';
import { DB, type Db } from '../db/db.module';

type RouteRecord = typeof routes.$inferSelect;
type ShopRecord = typeof shops.$inferSelect;

function toRouteResponse(row: RouteRecord): RouteResponse {
  return row;
}

function toShopResponse(row: ShopRecord) {
  return { ...row, creditLimit: Number(row.creditLimit) };
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('code' in error && error.code === '23505') return true;
  return 'cause' in error && error.cause !== error && isUniqueViolation(error.cause);
}

@Injectable()
export class RoutesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(query: RouteListQuery) {
    const filters = [];
    if (query.active !== undefined) filters.push(eq(routes.isActive, query.active));
    if (query.query) {
      const pattern = `%${query.query}%`;
      filters.push(or(ilike(routes.name, pattern), ilike(routes.code, pattern))!);
    }
    const where = filters.length ? and(...filters) : undefined;
    const offset = (query.page - 1) * query.pageSize;
    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select()
        .from(routes)
        .where(where)
        .orderBy(routes.name, routes.id)
        .limit(query.pageSize)
        .offset(offset),
      this.db.select({ total: count() }).from(routes).where(where),
    ]);

    return {
      items: rows.map(toRouteResponse),
      page: query.page,
      pageSize: query.pageSize,
      total: totalRow?.total ?? 0,
    };
  }

  async get(id: string): Promise<RouteDetailResponse> {
    const [route] = await this.db.select().from(routes).where(eq(routes.id, id)).limit(1);
    if (!route) throw new NotFoundException('Route not found');
    const assignedShops = await this.db
      .select()
      .from(shops)
      .where(eq(shops.routeId, id))
      .orderBy(shops.visitOrder, shops.id);
    return {
      ...toRouteResponse(route),
      shops: assignedShops.map(toShopResponse),
    };
  }

  async create(input: RouteCreate): Promise<RouteResponse> {
    try {
      const [row] = await this.db
        .insert(routes)
        .values({ ...input, description: input.description ?? null })
        .returning();
      return toRouteResponse(row!);
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('A route with this code already exists');
      throw error;
    }
  }

  async update(id: string, input: RouteUpdate): Promise<RouteResponse> {
    try {
      const [row] = await this.db
        .update(routes)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(routes.id, id))
        .returning();
      if (!row) throw new NotFoundException('Route not found');
      return toRouteResponse(row);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      if (isUniqueViolation(error))
        throw new ConflictException('A route with this code already exists');
      throw error;
    }
  }

  /**
   * Replaces all membership for this route. Array position is visit order starting at one.
   * A shop assigned to another route is atomically moved here, removing it from the old route.
   */
  async replaceShops(id: string, input: ReplaceRouteShops): Promise<RouteDetailResponse> {
    return this.db.transaction(async (tx) => {
      const [route] = await tx.select().from(routes).where(eq(routes.id, id)).for('update');
      if (!route) throw new NotFoundException('Route not found');
      if (!route.isActive) throw new ConflictException('Cannot assign shops to an inactive route');

      const shopConditions = [eq(shops.routeId, id)];
      if (input.shopIds.length > 0) shopConditions.push(inArray(shops.id, input.shopIds));
      const affectedShops = await tx
        .select()
        .from(shops)
        .where(or(...shopConditions))
        .orderBy(shops.id)
        .for('update');
      const foundIds = new Set(affectedShops.map((shop) => shop.id));
      if (input.shopIds.some((shopId) => !foundIds.has(shopId))) {
        throw new NotFoundException('One or more shops were not found');
      }
      const selectedShops = affectedShops.filter((shop) => input.shopIds.includes(shop.id));
      if (selectedShops.some((shop) => !shop.isActive)) {
        throw new ConflictException('Inactive shops cannot be assigned to a route');
      }

      await tx
        .update(shops)
        .set({ routeId: null, visitOrder: null, updatedAt: new Date() })
        .where(eq(shops.routeId, id));

      for (const [index, shopId] of input.shopIds.entries()) {
        await tx
          .update(shops)
          .set({ routeId: id, visitOrder: index + 1, updatedAt: new Date() })
          .where(eq(shops.id, shopId));
      }

      const assignedShops = await tx
        .select()
        .from(shops)
        .where(eq(shops.routeId, id))
        .orderBy(shops.visitOrder, shops.id);
      return {
        ...toRouteResponse(route),
        shops: assignedShops.map(toShopResponse),
      };
    });
  }
}

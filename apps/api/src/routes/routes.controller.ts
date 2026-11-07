import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ReplaceRouteShopsSchema,
  RouteCreateSchema,
  RouteListQuerySchema,
  RouteUpdateSchema,
  type ReplaceRouteShops,
  type RouteCreate,
  type RouteListQuery,
  type RouteUpdate,
} from '@jogylink/shared';
import { Roles } from '../auth/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RoutesService } from './routes.service';

@Controller('routes')
export class RoutesController {
  constructor(@Inject(RoutesService) private readonly routes: RoutesService) {}

  @Get()
  list(@Query(new ZodValidationPipe(RouteListQuerySchema)) query: RouteListQuery) {
    return this.routes.list(query);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.routes.get(id);
  }

  @Post()
  @Roles('owner')
  create(@Body(new ZodValidationPipe(RouteCreateSchema)) body: RouteCreate) {
    return this.routes.create(body);
  }

  @Patch(':id')
  @Roles('owner')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(RouteUpdateSchema)) body: RouteUpdate,
  ) {
    return this.routes.update(id, body);
  }

  @Put(':id/shops')
  @Roles('owner')
  replaceShops(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ReplaceRouteShopsSchema)) body: ReplaceRouteShops,
  ) {
    return this.routes.replaceShops(id, body);
  }
}

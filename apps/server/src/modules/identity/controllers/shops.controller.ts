import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import type { HttpRequest } from '../../../common/http';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { CreateShopDto } from '../dto/auth.dto';
import type { SessionRecord } from '../ports/session-store';
import { SessionGuard } from '../guards/session.guard';
import { ShopCreationService } from '../services/shop-creation.service';
import type { ShopCreated } from '../types/shop-created';

// The create-shop step needs a signed-in session with no shop yet (D13). It runs on the platform host, before a shop exists.
@Controller('shops')
@SkipTenant()
export class ShopsController {
  constructor(@Inject(ShopCreationService) private readonly shops: ShopCreationService) {}

  @Post()
  @UseGuards(SessionGuard)
  create(
    @Body(new ZodValidationPipe(CreateShopDto.schema)) body: CreateShopDto,
    @Req() request: HttpRequest & { session: SessionRecord },
  ): Promise<ShopCreated> {
    return this.shops.createShop(request.session, body);
  }
}

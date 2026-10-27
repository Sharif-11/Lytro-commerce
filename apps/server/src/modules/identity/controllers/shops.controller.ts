import { Body, Controller, Get, Inject, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ClientIp } from '../../../common/client-ip';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ResponseMessage } from '../../../common/decorators/response-message';
import type { HttpRequest } from '../../../common/http';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { AddressCheckQueryDto, CreateShopDto } from '../dto/auth.dto';
import { AddressCheckDto, ShopCreatedDto } from '../dto/shop-response.dto';
import type { SessionRecord } from '../ports/session-store';
import { OwnAccountGuard } from '../guards/own-account.guard';
import { SessionGuard } from '../guards/session.guard';
import { AddressChecks } from '../services/address-checks';
import { ShopCreationService } from '../services/shop-creation.service';
import type { AddressCheckView } from '../types/address-check-view';
import type { ShopCreated } from '../types/shop-created';

// The create-shop step needs a signed-in session with no shop yet (D13). It runs on the platform host, before a shop exists.
@ApiTags('Shops')
@Controller('shops')
@SkipTenant()
export class ShopsController {
  constructor(
    @Inject(ShopCreationService) private readonly shops: ShopCreationService,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
    @Inject(AddressChecks) private readonly addresses: AddressChecks,
  ) {}

  @Get('address-check')
  @UseGuards(SessionGuard)
  @ResponseMessage('AddressChecked')
  @ApiOperation({
    summary: 'Whether a shop address is free, with the next free one when not (AUTH-11)',
  })
  @ApiQuery({ name: 'address', type: String })
  @ZodResponse({ type: AddressCheckDto })
  checkAddress(
    @Query(new ZodValidationPipe(AddressCheckQueryDto.schema)) query: AddressCheckQueryDto,
    @Req() request: HttpRequest & { session: SessionRecord },
  ): Promise<AddressCheckView> {
    return this.addresses.check(request.session.subscriberId, query.address);
  }

  // A shop is opened in the account's own name, so never from a staff sign-in (TEN-31).
  @Post()
  @UseGuards(SessionGuard, OwnAccountGuard)
  @ResponseMessage('ShopCreated')
  @ApiOperation({ summary: "Create the signed-in account's shop" })
  @ApiBody({ type: CreateShopDto })
  @ZodResponse({ type: ShopCreatedDto })
  create(
    @Body(new ZodValidationPipe(CreateShopDto.schema)) body: CreateShopDto,
    @Req() request: HttpRequest & { session: SessionRecord },
  ): Promise<ShopCreated> {
    return this.shops.createShop(request.session, body, this.clientIp.resolve(request));
  }
}

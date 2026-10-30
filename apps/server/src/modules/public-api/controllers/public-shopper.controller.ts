import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import {
  OrderStatus,
  shopperAddressSchema,
  shopperAddressUpdateSchema,
  shopperCodeSchema,
  shopperOrdersQuerySchema,
  shopperPasswordSchema,
  shopperProfileSchema,
  shopperSigninSchema,
  shopperSignupSchema,
  type ShopperAddressInput,
  type ShopperAddressUpdateInput,
  type ShopperCodeInput,
  type ShopperOrdersQuery,
  type ShopperPasswordInput,
  type ShopperProfileInput,
  type ShopperSigninInput,
  type ShopperSignupInput,
} from '@lytronix/validators';
import { OkDto } from '../../../common/dto/ok.dto';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { resolveLanguage } from '../../../common/i18n/accept-language';
import { headerValue } from '../../../common/http';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { OrderTracking } from '../../orders/services/order-tracking';
import type { ShopperOrderPage } from '../../orders/types/orders';
import { ShopperAccounts, shopperViewOf } from '../../shoppers/services/shopper-accounts';
import { ShopperAddresses } from '../../shoppers/services/shopper-addresses';
import { ShopperCodes } from '../../shoppers/services/shopper-codes';
import type {
  ShopperAddressView,
  ShopperCodeSent,
  ShopperSignedIn,
  ShopperView,
} from '../../shoppers/types/shoppers';
import type { PublicApiRequest } from '../guards/public-key.guard';
import { ShopperGate } from '../services/shopper-gate';
import { API_CLOCK } from '../tokens';
import type { ApiShop } from '../types/public-api';
import { PublicApi } from './public-shop.controller';

class ShopperCodeDto extends createZodDto(shopperCodeSchema) {}
class ShopperSignupDto extends createZodDto(shopperSignupSchema) {}
class ShopperSigninDto extends createZodDto(shopperSigninSchema) {}
class ShopperProfileDto extends createZodDto(shopperProfileSchema) {}
class ShopperPasswordDto extends createZodDto(shopperPasswordSchema) {}
class ShopperAddressDto extends createZodDto(shopperAddressSchema) {}
class ShopperAddressUpdateDto extends createZodDto(shopperAddressUpdateSchema) {}

const shopperSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  createdAt: z.coerce.date(),
});
class ShopperViewDto extends createZodDto(shopperSchema) {}
class ShopperSignedInDto extends createZodDto(
  z.object({ token: z.string(), expiresAt: z.coerce.date(), shopper: shopperSchema }),
) {}
class ShopperCodeSentDto extends createZodDto(
  z.object({ expiresInSeconds: z.number(), resendAfterSeconds: z.number() }),
) {}
class ShopperAddressesDto extends createZodDto(
  z.object({
    addresses: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        location: z
          .object({
            id: z.number(),
            nameEn: z.string(),
            nameBn: z.string(),
            cityCode: z.string().nullable(),
            zillaId: z.number(),
          })
          .nullable(),
        deliveryAddress: z.string(),
        isDefault: z.boolean(),
      }),
    ),
  }),
) {}
class ShopperOrderPageDto extends createZodDto(
  z.object({
    orders: z.array(
      z.object({
        orderNumber: z.string(),
        trackingId: z.string(),
        status: z.nativeEnum(OrderStatus),
        grandTotal: z.string(),
        createdAt: z.coerce.date(),
      }),
    ),
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    pages: z.number(),
  }),
) {}

const TOKEN_HEADER = { name: 'X-Shopper-Token', required: true };

// CUS-03 to CUS-06, ORD-18 (Phase 4 Slice 4.4b, read agreed 2026-10-30): a shopper's account in the key's shop. The
// account is made with a code sent once to the phone and paid from the shop's balance, then signed in with phone and
// password; the routes after sign-in take the token as X-Shopper-Token. Behind the public key's gate, with the
// per-visitor windows on codes and sign-ins.
@ApiTags('Public API')
@Controller('public/shopper')
@PublicApi()
export class PublicShopperController {
  constructor(
    @Inject(ShopperCodes) private readonly codes: ShopperCodes,
    @Inject(ShopperAccounts) private readonly accounts: ShopperAccounts,
    @Inject(ShopperAddresses) private readonly addresses: ShopperAddresses,
    @Inject(OrderTracking) private readonly tracking: OrderTracking,
    @Inject(ShopperGate) private readonly gate: ShopperGate,
    @Inject(API_CLOCK) private readonly clock: () => Date,
  ) {}

  @Post('code')
  @HttpCode(200)
  @ResponseMessage('ShopperCodeSent')
  @ApiOperation({
    summary:
      "Send the sign-up code to the phone; paid from the shop's balance, never sent when it can't cover it (CUS-04)",
  })
  @ApiBody({ type: ShopperCodeDto })
  @ZodResponse({ type: ShopperCodeSentDto })
  sendCode(
    @Body(new ZodValidationPipe(ShopperCodeDto.schema)) body: ShopperCodeInput,
    @Req() request: PublicApiRequest,
  ): Promise<ShopperCodeSent> {
    const shop = this.shopOf(request);
    this.gate.admitCode(shop, request, this.clock());
    return this.codes.send(
      { id: shop.row.id, name: shop.row.shopName },
      body.phone,
      resolveLanguage(headerValue(request.headers['accept-language']) ?? undefined),
    );
  }

  @Post('signup')
  @ResponseMessage('ShopperSignedUp')
  @ApiOperation({
    summary: "Make the account with the phone's code, a name and a password; signed in (CUS-03)",
  })
  @ApiBody({ type: ShopperSignupDto })
  @ZodResponse({ type: ShopperSignedInDto })
  signUp(
    @Body(new ZodValidationPipe(ShopperSignupDto.schema)) body: ShopperSignupInput,
    @Req() request: PublicApiRequest,
  ): Promise<ShopperSignedIn> {
    const shop = this.shopOf(request);
    this.gate.admitSignin(shop, request, this.clock());
    return this.accounts.signUp(shop.row.id, body);
  }

  @Post('signin')
  @HttpCode(200)
  @ResponseMessage('ShopperSignedIn')
  @ApiOperation({ summary: 'Sign in with phone and password, no code (CUS-03)' })
  @ApiBody({ type: ShopperSigninDto })
  @ZodResponse({ type: ShopperSignedInDto })
  signIn(
    @Body(new ZodValidationPipe(ShopperSigninDto.schema)) body: ShopperSigninInput,
    @Req() request: PublicApiRequest,
  ): Promise<ShopperSignedIn> {
    const shop = this.shopOf(request);
    this.gate.admitSignin(shop, request, this.clock());
    return this.accounts.signIn(shop.row.id, body);
  }

  @Post('signout')
  @HttpCode(200)
  @ResponseMessage('ShopperSignedOut')
  @ApiOperation({ summary: 'End this sign-in' })
  @ApiHeader(TOKEN_HEADER)
  @ZodResponse({ type: OkDto })
  async signOut(@Req() request: PublicApiRequest): Promise<{ ok: true }> {
    const shop = this.shopOf(request);
    await this.accounts.signOut(shop.row.id, await this.gate.signedIn(shop, request));
    return { ok: true };
  }

  @Get('me')
  @ResponseMessage('ShopperRetrieved')
  @ApiOperation({ summary: "The signed-in shopper's account (CUS-05)" })
  @ApiHeader(TOKEN_HEADER)
  @ZodResponse({ type: ShopperViewDto })
  async me(@Req() request: PublicApiRequest): Promise<ShopperView> {
    const shop = this.shopOf(request);
    return shopperViewOf((await this.gate.signedIn(shop, request)).shopper);
  }

  @Patch('me')
  @ResponseMessage('ShopperUpdated')
  @ApiOperation({ summary: "Change the shopper's name; the phone never changes (CUS-05)" })
  @ApiHeader(TOKEN_HEADER)
  @ApiBody({ type: ShopperProfileDto })
  @ZodResponse({ type: ShopperViewDto })
  async rename(
    @Body(new ZodValidationPipe(ShopperProfileDto.schema)) body: ShopperProfileInput,
    @Req() request: PublicApiRequest,
  ): Promise<ShopperView> {
    const shop = this.shopOf(request);
    return this.accounts.rename(shop.row.id, await this.gate.signedIn(shop, request), body);
  }

  @Post('password')
  @HttpCode(200)
  @ResponseMessage('PasswordChanged')
  @ApiOperation({
    summary: "A new password, given the current one; the shopper's other sign-ins end",
  })
  @ApiHeader(TOKEN_HEADER)
  @ApiBody({ type: ShopperPasswordDto })
  @ZodResponse({ type: OkDto })
  async changePassword(
    @Body(new ZodValidationPipe(ShopperPasswordDto.schema)) body: ShopperPasswordInput,
    @Req() request: PublicApiRequest,
  ): Promise<{ ok: true }> {
    const shop = this.shopOf(request);
    await this.accounts.changePassword(shop.row.id, await this.gate.signedIn(shop, request), body);
    return { ok: true };
  }

  @Get('addresses')
  @ResponseMessage('ShopperAddressesRetrieved')
  @ApiOperation({ summary: "The shopper's saved addresses, the default first (CUS-06)" })
  @ApiHeader(TOKEN_HEADER)
  @ZodResponse({ type: ShopperAddressesDto })
  async listAddresses(
    @Req() request: PublicApiRequest,
  ): Promise<{ addresses: ShopperAddressView[] }> {
    const shop = this.shopOf(request);
    return {
      addresses: await this.addresses.list(shop.row.id, await this.gate.signedIn(shop, request)),
    };
  }

  @Post('addresses')
  @ResponseMessage('ShopperAddressSaved')
  @ApiOperation({ summary: 'Save an address, up to 10; the first is the default (CUS-06)' })
  @ApiHeader(TOKEN_HEADER)
  @ApiBody({ type: ShopperAddressDto })
  @ZodResponse({ type: ShopperAddressesDto })
  async addAddress(
    @Body(new ZodValidationPipe(ShopperAddressDto.schema)) body: ShopperAddressInput,
    @Req() request: PublicApiRequest,
  ): Promise<{ addresses: ShopperAddressView[] }> {
    const shop = this.shopOf(request);
    return {
      addresses: await this.addresses.add(
        shop.row.id,
        await this.gate.signedIn(shop, request),
        body,
      ),
    };
  }

  @Patch('addresses/:id')
  @ResponseMessage('ShopperAddressSaved')
  @ApiOperation({ summary: 'Change a saved address, or make it the default (CUS-06)' })
  @ApiHeader(TOKEN_HEADER)
  @ApiBody({ type: ShopperAddressUpdateDto })
  @ZodResponse({ type: ShopperAddressesDto })
  async updateAddress(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ShopperAddressUpdateDto.schema)) body: ShopperAddressUpdateInput,
    @Req() request: PublicApiRequest,
  ): Promise<{ addresses: ShopperAddressView[] }> {
    const shop = this.shopOf(request);
    return {
      addresses: await this.addresses.update(
        shop.row.id,
        await this.gate.signedIn(shop, request),
        id,
        body,
      ),
    };
  }

  @Delete('addresses/:id')
  @ResponseMessage('ShopperAddressRemoved')
  @ApiOperation({
    summary: 'Delete a saved address; the oldest left becomes the default if it was (CUS-06)',
  })
  @ApiHeader(TOKEN_HEADER)
  @ZodResponse({ type: ShopperAddressesDto })
  async removeAddress(
    @Param('id') id: string,
    @Req() request: PublicApiRequest,
  ): Promise<{ addresses: ShopperAddressView[] }> {
    const shop = this.shopOf(request);
    return {
      addresses: await this.addresses.remove(
        shop.row.id,
        await this.gate.signedIn(shop, request),
        id,
      ),
    };
  }

  @Get('orders')
  @ResponseMessage('OrdersRetrieved')
  @ApiOperation({
    summary:
      "Every order of the shop with the shopper's phone, newest first: numbers, status and total, never a name or address (ORD-18)",
  })
  @ApiHeader(TOKEN_HEADER)
  @ZodResponse({ type: ShopperOrderPageDto })
  async orders(
    @Query(new ZodValidationPipe(shopperOrdersQuerySchema)) query: ShopperOrdersQuery,
    @Req() request: PublicApiRequest,
  ): Promise<ShopperOrderPage> {
    const shop = this.shopOf(request);
    const signedIn = await this.gate.signedIn(shop, request);
    return this.tracking.ordersOfPhone(shop.row.id, signedIn.shopper.phone, query);
  }

  private shopOf(request: PublicApiRequest): ApiShop {
    const shop = request.apiShop;
    if (!shop) throw new Error('the public key guard names the shop');
    return shop;
  }
}

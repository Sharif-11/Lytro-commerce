import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { CompleteSignupDto, RequestCodeDto } from '../dto/phone-signup.dto';
import { PhoneSignupService, type ShopCreated } from '../services/phone-signup.service';
import type { CodeIssued } from '../services/one-time-code.service';

// Sign-up creates the tenant, so it runs before any shop exists and is marked SkipTenant (TEN-7a).
@Controller('signup/phone')
@SkipTenant()
export class PhoneSignupController {
  constructor(@Inject(PhoneSignupService) private readonly signup: PhoneSignupService) {}

  @Post('code')
  @HttpCode(200)
  requestCode(
    @Body(new ZodValidationPipe(RequestCodeDto.schema)) body: RequestCodeDto,
  ): Promise<CodeIssued> {
    return this.signup.requestCode(body.phone);
  }

  @Post('complete')
  complete(
    @Body(new ZodValidationPipe(CompleteSignupDto.schema)) body: CompleteSignupDto,
  ): Promise<ShopCreated> {
    return this.signup.createShop(body);
  }
}

import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { z } from 'zod';
import { ApiError } from '../common/api-error';
import { SkipTenant } from '../tenancy/tenant.guard';
import { SignupService, type CodeIssued, type ShopCreated } from './signup.service';

// Sign-up creates the tenant, so it runs before any shop exists and is marked SkipTenant (TEN-7a).
const phoneBody = z.object({ phone: z.string().max(30) });
const completeBody = z.object({
  phone: z.string().max(30),
  code: z.string().regex(/^\d{6}$/, 'six digits'),
  ownerName: z.string().max(200),
  shopName: z.string().max(200),
  address: z.string().max(60).optional(),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError('validation_error', 'Check the highlighted fields.', {
      fields: result.error.issues.map((issue) => issue.path.join('.')),
    });
  }
  return result.data;
}

@Controller('signup/phone')
@SkipTenant()
export class SignupController {
  constructor(@Inject(SignupService) private readonly signup: SignupService) {}

  @Post('code')
  @HttpCode(200)
  requestCode(@Body() body: unknown): Promise<CodeIssued> {
    const { phone } = parse(phoneBody, body);
    return this.signup.requestCode(phone);
  }

  @Post('complete')
  complete(@Body() body: unknown): Promise<ShopCreated> {
    const input = parse(completeBody, body);
    return this.signup.createShop(input);
  }
}

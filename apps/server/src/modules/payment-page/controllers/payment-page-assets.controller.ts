import { Controller, Get, Inject, Param, Res, UseFilters, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ApiError } from '../../../common/api-error';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { PaymentPageErrors } from '../filters/payment-page-errors.filter';
import { PaymentPageHostGuard } from '../guards/payment-page-host.guard';
import { PaymentPageAssets } from '../services/payment-page-assets';

interface AssetResponse {
  status(code: number): AssetResponse;
  set(headers: Record<string, string>): AssetResponse;
  send(body: Buffer): unknown;
}

/** PAY-23: the page's own stylesheet, script, fonts and wallet marks, from its own host, kept by a phone for a year. */
@ApiExcludeController()
@Controller('pay-assets')
@SkipTenant()
@UseFilters(PaymentPageErrors)
@UseGuards(PaymentPageHostGuard)
export class PaymentPageAssetsController {
  constructor(@Inject(PaymentPageAssets) private readonly assets: PaymentPageAssets) {}

  @Get(':file')
  file(@Param('file') name: string, @Res() response: AssetResponse): void {
    const asset = this.assets.file(name);
    if (!asset) throw new ApiError('not_found', 'PageNotFound');
    response
      .status(200)
      .set({
        'Content-Type': asset.type,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(asset.data);
  }
}

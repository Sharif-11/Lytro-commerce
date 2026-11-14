import { Controller, Get, Inject, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  catalogueIdSchema,
  credentialUsesExportQuerySchema,
  type CredentialUsesExportQuery,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { OperatorSessionGuard } from '../../operator/guards/operator-session.guard';
import { CredentialUseExport } from '../services/credential-use-export';

// The raw response a CSV route writes to, as the operator's reports' exports use it.
interface RawResponse {
  status(code: number): RawResponse;
  set(headers: Record<string, string>): RawResponse;
  send(body: string): void;
}

// SEC-11 (Phase 9 Slice 9.7): a shop's every use of its stored credentials as a CSV, for the operator to answer a
// dispute with. The console's button for it comes with Slice 9.9's screens.
@ApiTags('Operator Couriers')
@Controller('operator')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorCredentialUsesController {
  constructor(@Inject(CredentialUseExport) private readonly exports: CredentialUseExport) {}

  @Get('tenants/:id/credential-uses.csv')
  @ApiOperation({
    summary:
      "A shop's every use of its stored courier, gateway and Meta credentials over whole Dhaka days, as a CSV, never a credential (SEC-11)",
  })
  async csv(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(credentialUsesExportQuerySchema)) query: CredentialUsesExportQuery,
    @Res() response: RawResponse,
  ): Promise<void> {
    const parsed = catalogueIdSchema.safeParse(id);
    if (!parsed.success) throw new ApiError('not_found', 'ShopNotFound', {});
    const { fileName, csv } = await this.exports.csv(parsed.data, query);
    response
      .status(200)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      })
      .send(csv);
  }
}

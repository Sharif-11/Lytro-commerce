import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ZodResponse, createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ApiError } from '../../../common/api-error';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { SkipEdge } from '../../../common/decorators/skip-edge';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { HostClassifier } from '../../tenancy/services/host-classifier';
import { TenantResolver } from '../../tenancy/services/tenant-resolver.service';

class DomainAskDto extends createZodDto(z.object({ domain: z.string() })) {}

// TEN-13 (Slice 13): the edge asks before it gets a certificate for a name it has none for (Caddy's on-demand TLS), so
// no certificate is spent on a name no shop serves. Yes (200) only for a domain or its twin answering for a shop now --
// open or closed, since a closed shop's page needs HTTPS too; anything else is not found. The edge calls this
// directly, without its secret, and what it says is public in DNS already.
@ApiExcludeController()
@Controller('internal/domains')
@SkipTenant()
@SkipEdge()
export class DomainAskController {
  constructor(
    @Inject(HostClassifier) private readonly hosts: HostClassifier,
    @Inject(TenantResolver) private readonly tenants: TenantResolver,
  ) {}

  @Get('ask')
  @ResponseMessage('Success')
  @ZodResponse({ type: DomainAskDto })
  async ask(@Query('domain') domain: string | undefined): Promise<{ domain: string }> {
    const target = this.hosts.classify(domain);
    if (target.kind === 'custom') {
      const resolved = await this.tenants.resolve(target.hostname);
      if (resolved.outcome !== 'not_found') return { domain: target.hostname };
    }
    throw new ApiError('not_found', 'PageNotFound');
  }
}

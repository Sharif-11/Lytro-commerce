import { Module } from '@nestjs/common';
import { DrizzleDomainStore } from '../../database/adapters/domain.adapter';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { DomainAskController } from './controllers/domain-ask.controller';
import { DomainEraser } from './services/domain-eraser';
import { DomainRecords } from './services/domain-records';
import { DomainService } from './services/domain.service';
import { DomainVerifier } from './services/domain-verifier';
import { NodeDnsLookup } from './services/node-dns-lookup';
import { DNS_LOOKUP, DOMAIN_STORE } from './tokens';

// TEN-09 to TEN-14, DWN-10 (Slice 13): a shop's own domain. It depends on tenancy (the host lookup it feeds, and the
// cache it clears) and on the catalogue's activity log, and nothing it depends on depends back on it: the dashboard's
// routes, the account read, the storefront's context, the recurring check and the day-60 deletion all read it.
@Module({
  imports: [TenancyModule, CatalogueModule],
  controllers: [DomainAskController],
  providers: [
    { provide: DOMAIN_STORE, useClass: DrizzleDomainStore },
    { provide: DNS_LOOKUP, useClass: NodeDnsLookup },
    DomainRecords,
    DomainVerifier,
    DomainService,
    DomainEraser,
  ],
  exports: [DomainService, DomainEraser],
})
export class DomainsModule {}

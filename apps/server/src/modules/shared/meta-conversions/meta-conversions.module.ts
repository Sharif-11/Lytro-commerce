import { Module } from '@nestjs/common';
import { GraphMetaConversions } from './services/graph-meta-conversions';
import { META_CONVERSIONS } from './tokens';

// LND-16, MKT-02: the one Conversions API client, for a shop's own pixel (public-api) and for Lytro's (platform-ads).
@Module({
  providers: [{ provide: META_CONVERSIONS, useClass: GraphMetaConversions }],
  exports: [META_CONVERSIONS],
})
export class MetaConversionsModule {}

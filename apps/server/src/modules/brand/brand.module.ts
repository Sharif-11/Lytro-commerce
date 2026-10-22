import { Module } from '@nestjs/common';
import { DrizzleBrandStore } from '../../database/adapters/brand.adapter';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { BrandEraser } from './services/brand-eraser';
import { BrandService } from './services/brand.service';
import { BRAND_STORE } from './tokens';

// BRN-01 to BRN-07: a shop's own brand identity. It depends on the catalogue (its images show the way the catalogue's
// do, and its changes are logged the same way) and on nothing that depends back on it: the dashboard's account read,
// the public shop read, the installed app and the day-60 deletion all read it.
@Module({
  imports: [CatalogueModule],
  providers: [{ provide: BRAND_STORE, useClass: DrizzleBrandStore }, BrandService, BrandEraser],
  exports: [BrandService, BrandEraser],
})
export class BrandModule {}

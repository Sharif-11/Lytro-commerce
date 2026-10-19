import { Module } from '@nestjs/common';
import {
  DrizzleAttributeStore,
  DrizzleCatalogueTransactions,
  DrizzleCategoryStore,
  DrizzlePresetStore,
  DrizzleProductStore,
} from '../../database/adapters/catalogue.adapter';
import { AuditModule } from '../audit/audit.module';
import { BalanceModule } from '../balance/balance.module';
import { StaffModule } from '../staff/staff.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { AttributeService } from './services/attribute.service';
import { CatalogueActivity } from './services/catalogue-activity';
import { CategoryService } from './services/category.service';
import { PresetService } from './services/preset.service';
import { ProductService } from './services/product.service';
import {
  ATTRIBUTE_STORE,
  CATALOGUE_TRANSACTIONS,
  CATEGORY_STORE,
  PRESET_STORE,
  PRODUCT_STORE,
} from './tokens';

// D3-7: the catalogue module -- categories, products, variants, attributes and the shop-type presets. It depends on
// balance (the pay-as-you-go product fee joins the creation's transaction, PYG-16), audit, staff (naming the owner)
// and tenancy (the shop's business type); nothing in those depends back on it. Inventory (Slice 2) will.
@Module({
  imports: [AuditModule, BalanceModule, StaffModule, TenancyModule],
  providers: [
    { provide: CATALOGUE_TRANSACTIONS, useClass: DrizzleCatalogueTransactions },
    { provide: ATTRIBUTE_STORE, useClass: DrizzleAttributeStore },
    { provide: CATEGORY_STORE, useClass: DrizzleCategoryStore },
    { provide: PRODUCT_STORE, useClass: DrizzleProductStore },
    { provide: PRESET_STORE, useClass: DrizzlePresetStore },
    CatalogueActivity,
    PresetService,
    AttributeService,
    CategoryService,
    ProductService,
  ],
  exports: [PresetService, AttributeService, CategoryService, ProductService],
})
export class CatalogueModule {}

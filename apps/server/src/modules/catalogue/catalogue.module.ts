import { Module } from '@nestjs/common';
import {
  DrizzleAttributeStore,
  DrizzleCatalogueDataStore,
  DrizzleCatalogueImageStore,
  DrizzleCatalogueTransactions,
  DrizzleCategoryStore,
  DrizzleOptionSetStore,
  DrizzlePlatformLibraryStore,
  DrizzlePresetStore,
  DrizzleProductStore,
  DrizzleShopPolicyStore,
  DrizzleSizeChartStore,
} from '../../database/adapters/catalogue.adapter';
import { MediaLinks } from '../../common/media-links';
import { AuditModule } from '../audit/audit.module';
import { BalanceModule } from '../balance/balance.module';
import { StaffModule } from '../staff/staff.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { UsageWarningsModule } from '../usage-warnings/usage-warnings.module';
import { AttributeService } from './services/attribute.service';
import { CatalogueActivity } from './services/catalogue-activity';
import { CatalogueEraser } from './services/catalogue-eraser';
import { CatalogueImages } from './services/catalogue-images';
import { CatalogueVersion } from './services/catalogue-version';
import { CategoryService } from './services/category.service';
import { OptionSetService } from './services/option-set.service';
import { PlatformLibraryService } from './services/platform-library.service';
import { PresetService } from './services/preset.service';
import { ProductService } from './services/product.service';
import { ShopPaymentPolicyService } from './services/shop-payment-policy.service';
import { SizeChartService } from './services/size-chart.service';
import { ComboParts } from './services/combo-parts';
import { DrizzleComboStore } from '../../database/adapters/combo.adapter';
import {
  ATTRIBUTE_STORE,
  CATALOGUE_DATA_STORE,
  CATALOGUE_IMAGE_STORE,
  CATALOGUE_TRANSACTIONS,
  CATEGORY_STORE,
  OPTION_SET_STORE,
  PLATFORM_LIBRARY_STORE,
  PRESET_STORE,
  PRODUCT_STORE,
  SHOP_POLICY_STORE,
  SIZE_CHART_STORE,
  COMBO_STORE,
} from './tokens';

// D3-7: the catalogue module -- categories, products, variants, attributes, size charts, option sets, the shop-type
// presets and the operator's curation of the platform's share of them. It depends on
// balance (the pay-as-you-go product fee joins the creation's transaction, PYG-16), audit, staff (naming the owner)
// and tenancy (the shop's business type); nothing in those depends back on it. Inventory (Slice 2) will.
@Module({
  imports: [AuditModule, BalanceModule, StaffModule, TenancyModule, UsageWarningsModule],
  providers: [
    { provide: CATALOGUE_TRANSACTIONS, useClass: DrizzleCatalogueTransactions },
    { provide: ATTRIBUTE_STORE, useClass: DrizzleAttributeStore },
    { provide: CATEGORY_STORE, useClass: DrizzleCategoryStore },
    { provide: PRODUCT_STORE, useClass: DrizzleProductStore },
    { provide: PRESET_STORE, useClass: DrizzlePresetStore },
    { provide: SIZE_CHART_STORE, useClass: DrizzleSizeChartStore },
    { provide: COMBO_STORE, useClass: DrizzleComboStore },
    { provide: OPTION_SET_STORE, useClass: DrizzleOptionSetStore },
    { provide: PLATFORM_LIBRARY_STORE, useClass: DrizzlePlatformLibraryStore },
    { provide: SHOP_POLICY_STORE, useClass: DrizzleShopPolicyStore },
    { provide: CATALOGUE_DATA_STORE, useClass: DrizzleCatalogueDataStore },
    { provide: CATALOGUE_IMAGE_STORE, useClass: DrizzleCatalogueImageStore },
    MediaLinks,
    CatalogueImages,
    CatalogueActivity,
    CatalogueEraser,
    CatalogueVersion,
    ShopPaymentPolicyService,
    PresetService,
    AttributeService,
    CategoryService,
    ProductService,
    SizeChartService,
    ComboParts,
    OptionSetService,
    PlatformLibraryService,
  ],
  exports: [
    // For the delivery module (Slice 1c), whose writes log and version like the catalogue's own.
    CATALOGUE_TRANSACTIONS,
    CatalogueActivity,
    CatalogueVersion,
    ShopPaymentPolicyService,
    // For the media module (Slice 6), whose screens show images the same way.
    MediaLinks,
    CatalogueImages,
    // For the day-60 deletion (LIF-19).
    CatalogueEraser,
    PresetService,
    AttributeService,
    CategoryService,
    ProductService,
    SizeChartService,
    ComboParts,
    OptionSetService,
    PlatformLibraryService,
  ],
})
export class CatalogueModule {}

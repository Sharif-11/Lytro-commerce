import { Module } from '@nestjs/common';
import { DrizzleStorefrontDesignStore } from '../../database/adapters/storefront-design.adapter';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { EdgeCacheModule } from '../shared/edge-cache/edge-cache.module';
import { StorefrontDesignEraser } from './services/storefront-design-eraser';
import { StorefrontDesignService } from './services/storefront-design.service';
import { StorefrontPreviewLinks } from './services/storefront-preview-links';
import { STOREFRONT_DESIGN_STORE } from './tokens';

// STOREFRONT-BUILDER-PLAN SB-11 to SB-16: a shop's storefront design. Like the brand identity, it depends on the
// catalogue (its photos show the way the catalogue's do, and its changes are logged the same way) and on nothing that
// depends back on it: the editor's routes, the public shop read and the day-60 deletion all read it.
@Module({
  imports: [CatalogueModule, EdgeCacheModule],
  providers: [
    { provide: STOREFRONT_DESIGN_STORE, useClass: DrizzleStorefrontDesignStore },
    StorefrontDesignService,
    StorefrontPreviewLinks,
    StorefrontDesignEraser,
  ],
  exports: [StorefrontDesignService, StorefrontDesignEraser],
})
export class StorefrontDesignModule {}

import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { ShopAppController } from './controllers/shop-app.controller';
import { ShopAppService } from './services/shop-app.service';
import { ShopIcons } from './services/shop-icons';
import { SHOP_ICON_FONTS } from './tokens';

// TEN-17: each shop's dashboard installs as its own app. The fonts sit in apps/server/assets, three folders up from this
// module in the source (src/modules/shop-app) and in the build (dist/modules/shop-app) alike.
@Module({
  imports: [TenancyModule, MediaModule],
  controllers: [ShopAppController],
  providers: [
    { provide: SHOP_ICON_FONTS, useValue: join(__dirname, '..', '..', '..', 'assets', 'fonts') },
    ShopIcons,
    ShopAppService,
  ],
})
export class ShopAppModule {}

import { Controller, Get, Inject, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SLUG_PATTERN } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ShopAppService } from '../services/shop-app.service';
import { ShopIconFile } from '../types/shop-app';

/** The parts of an Express response a manifest or an icon writes. */
interface RawResponse {
  status(code: number): RawResponse;
  set(headers: Record<string, string>): RawResponse;
  send(body: string | Buffer): void;
}

const ICON_FILES: ReadonlySet<string> = new Set(Object.values(ShopIconFile));

function isIconFile(file: string): file is ShopIconFile {
  return ICON_FILES.has(file);
}

// A browser asks for the manifest again now and then; an icon's link changes with what it shows.
const MANIFEST_CACHE = 'public, max-age=300';
const ICON_CACHE = 'public, max-age=86400';

// TEN-17: a shop's installable app -- its manifest and icons, on the dashboard host, for any browser (no session: a
// browser never sends one for these). Raw JSON and PNG, never the API's envelope.
@ApiTags('Shop app')
@Controller('shops')
@SkipTenant()
export class ShopAppController {
  constructor(@Inject(ShopAppService) private readonly app: ShopAppService) {}

  @Get(':slug/manifest.webmanifest')
  @ApiOperation({
    summary: "The shop's web app manifest, so its dashboard installs as its own app (TEN-17)",
  })
  async manifest(@Param('slug') slug: string, @Res() response: RawResponse): Promise<void> {
    const manifest = SLUG_PATTERN.test(slug) ? await this.app.manifest(slug) : null;
    if (!manifest) throw new ApiError('not_found', 'PageNotFound', {});
    response
      .status(200)
      .set({ 'Content-Type': 'application/manifest+json', 'Cache-Control': MANIFEST_CACHE })
      .send(JSON.stringify(manifest));
  }

  @Get(':slug/icons/:file')
  @ApiOperation({
    summary: "One of the shop's app icons, its logo or its monogram, as a PNG (TEN-17)",
  })
  async icon(
    @Param('slug') slug: string,
    @Param('file') file: string,
    @Res() response: RawResponse,
  ): Promise<void> {
    const icon =
      SLUG_PATTERN.test(slug) && isIconFile(file) ? await this.app.icon(slug, file) : null;
    if (!icon) throw new ApiError('not_found', 'PageNotFound', {});
    response
      .status(200)
      .set({ 'Content-Type': 'image/png', 'Cache-Control': ICON_CACHE })
      .send(icon);
  }
}

import { AppIcons } from '@/lib/app/app-icons';
import { isStoreIconFile } from '@/lib/app/app-manifest';
import { ServerApi } from '@/lib/api/server-api';
import { StorefrontEnvironment } from '@/lib/env';
import { loadShopPage } from '@/lib/storefront';

// SFT-14, BRN-02 (Slice 12c): one of the storefront app's icons, also the tab's icon, as the server draws it. Its link
// carries a version of what it shows, so a browser may keep it a day.
export const dynamic = 'force-dynamic';

const env = StorefrontEnvironment.shared();
const icons = new AppIcons(new ServerApi(env.serverUrl), env);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<Response> {
  const { file } = await params;
  const page = await loadShopPage();
  if (page.state !== 'open' || !isStoreIconFile(file)) return new Response(null, { status: 404 });
  const drawn = await icons.icon(page.shop.slug, file);
  if (drawn.status !== 200) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(drawn.body), {
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' },
  });
}

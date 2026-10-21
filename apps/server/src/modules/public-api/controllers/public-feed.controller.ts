import { Controller, Get, Inject, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicApiRoute } from '../../../common/decorators/public-api';
import { CatalogFeedGuard } from '../guards/catalog-feed.guard';
import type { PublicApiRequest } from '../guards/public-key.guard';
import { PublicCatalogue } from '../services/public-catalogue';

/** The parts of an Express response a file download writes. */
interface RawResponse {
  status(code: number): RawResponse;
  set(headers: Record<string, string>): RawResponse;
  send(body: string): void;
}

// FED-01 to FED-05: a shop's Meta catalog feed, on the API host at /v1/feeds/meta/<token>.csv, for Meta Commerce
// Manager to fetch on its schedule. Its own gate stands in for the public key's (catalog-feed.guard.ts).
@ApiTags('Public API')
@Controller('public/feeds')
@PublicApiRoute()
@UseGuards(CatalogFeedGuard)
export class PublicFeedController {
  constructor(@Inject(PublicCatalogue) private readonly catalogue: PublicCatalogue) {}

  @Get('meta/:file')
  @ApiOperation({
    summary:
      "A shop's Meta catalog feed, one row per variant on sale, by the token in its secret address (FED-01, FED-02)",
  })
  async meta(@Req() request: PublicApiRequest, @Res() response: RawResponse): Promise<void> {
    if (!request.apiShop) throw new Error('the feed guard names the shop');
    const answer = await this.catalogue.feed(request.apiShop);
    // A tag Meta's fetcher sends back is answered 304 without the file, and still counted (FED-04).
    response
      .status(200)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': answer.cacheControl,
        ETag: answer.etag,
      })
      .send(answer.data);
  }
}

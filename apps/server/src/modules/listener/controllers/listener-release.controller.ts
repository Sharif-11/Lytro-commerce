import { Controller, Get, Header, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import type { ListenerAppRead } from '@lytronix/validators';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ListenerAppRelease } from '../services/listener-app-release';

class ListenerAppReadDto extends createZodDto(
  z.object({
    release: z.object({ version: z.string(), url: z.string(), bytes: z.number() }).nullable(),
  }),
) {}

// Cached a few minutes in the browser and on the way, as the server keeps it.
const LISTENER_APP_CACHE = 'public, max-age=300';

// TENANT-DASHBOARD-DESIGN §7.44 (small fixes, 2026-11-13): the listener app's current release for the dashboard's
// download button -- the same file for every shop, so no key or session, like the help line. On the dashboard's host,
// beside the team's /listener routes; the app's own routes are the API host's /v1/listener.
@ApiTags('Listener')
@Controller('listener')
@SkipTenant()
export class ListenerReleaseController {
  constructor(@Inject(ListenerAppRelease) private readonly releases: ListenerAppRelease) {}

  @Get('app')
  @Header('Cache-Control', LISTENER_APP_CACHE)
  @ResponseMessage('ListenerAppReleaseRead')
  @ApiOperation({
    summary:
      "The listener app's current release: its version, size and the file's link, or null (§7.44)",
  })
  @ZodResponse({ type: ListenerAppReadDto })
  async read(): Promise<ListenerAppRead> {
    return { release: await this.releases.current() };
  }
}

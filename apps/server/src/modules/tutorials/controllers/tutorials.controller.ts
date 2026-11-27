import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { tutorialDismissSchema, type TutorialDismissInput } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { TutorialDismissDto, TutorialOkDto, TutorialsViewDto } from '../dto/tutorials.dto';
import { TutorialLibrary, type TutorialPerson } from '../services/tutorial-library';

// TENANT-DASHBOARD-DESIGN §7.49: the tutorial videos for every member of a shop, each person's own marks. Watching and
// hiding a screen's videos still work while the shop is read-only: they change nothing of the shop's.
@ApiTags('Tutorials')
@Controller('tutorials')
@Dashboard({ readOnlyWrite: true })
@UseGuards(SessionGuard, DashboardGuard)
export class TutorialsController {
  constructor(@Inject(TutorialLibrary) private readonly library: TutorialLibrary) {}

  @Get()
  @ResponseMessage('TutorialsLoaded')
  @ApiOperation({
    summary:
      'The tutorial series in order: each part with its file, whether this person watched it, the screens they hid the videos on, and the playlist link',
  })
  @ZodResponse({ type: TutorialsViewDto })
  view(@Req() request: DashboardRequest) {
    return this.library.view(this.person(request));
  }

  @Post(':key/watched')
  @HttpCode(200)
  @ResponseMessage('TutorialWatched')
  @ApiOperation({
    summary: 'Mark a tutorial watched by this person (played to the end or past 90%)',
  })
  @ZodResponse({ type: TutorialOkDto })
  async watched(@Req() request: DashboardRequest, @Param('key') key: string) {
    await this.library.markWatched(this.person(request), key);
    return { ok: true as const };
  }

  @Post('dismissals')
  @HttpCode(200)
  @ResponseMessage('TutorialsDismissed')
  @ApiOperation({ summary: "Don't show the videos on this screen again, for this person" })
  @ApiBody({ type: TutorialDismissDto })
  @ZodResponse({ type: TutorialOkDto })
  async dismiss(
    @Req() request: DashboardRequest,
    @Body(new ZodValidationPipe(tutorialDismissSchema)) body: TutorialDismissInput,
  ) {
    await this.library.dismiss(this.person(request), body.screen);
    return { ok: true as const };
  }

  private person(request: DashboardRequest): TutorialPerson {
    const tenant = request.tenant;
    if (!tenant) throw new ApiError('forbidden', 'CreateShopToContinue', { next: 'create-shop' });
    return { tenantId: tenant.id, sessionUserId: request.session?.userId ?? null };
  }
}

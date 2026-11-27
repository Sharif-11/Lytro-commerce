import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  tutorialPlaylistSchema,
  tutorialPublishSchema,
  tutorialUploadStartSchema,
  type TutorialPlaylistInput,
  type TutorialPublishInput,
  type TutorialUploadStartInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import {
  OperatorTutorialDto,
  OperatorTutorialsDto,
  TutorialPlaylistDto,
  TutorialPlaylistViewDto,
  TutorialPublishDto,
  TutorialUploadDto,
  TutorialUploadStartDto,
} from '../dto/tutorials.dto';
import { TutorialDesk, type TutorialOperator } from '../services/tutorial-desk';

// OPERATOR-CONSOLE-DESIGN §10h: the console's Tutorials page -- each part's file, uploaded, replaced or removed, and the
// optional YouTube playlist link. The names, the order and the screens are in code; these routes only set files.
@ApiTags('Operator Tutorials')
@Controller('operator/tutorials')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorTutorialsController {
  constructor(
    @Inject(TutorialDesk) private readonly desk: TutorialDesk,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Get()
  @ResponseMessage('TutorialsListed')
  @ApiOperation({
    summary: 'The tutorial series in order, each part with its live file, and the playlist link',
  })
  @ZodResponse({ type: OperatorTutorialsDto })
  list() {
    return this.desk.list();
  }

  @Put('playlist')
  @ResponseMessage('TutorialPlaylistSaved')
  @ApiOperation({ summary: 'Set or clear the YouTube playlist Menu › Tutorials links to' })
  @ApiBody({ type: TutorialPlaylistDto })
  @ZodResponse({ type: TutorialPlaylistViewDto })
  playlist(
    @Req() request: OperatorSessionRequest,
    @Body(new ZodValidationPipe(tutorialPlaylistSchema)) body: TutorialPlaylistInput,
  ) {
    return this.desk.setPlaylist(body.playlistUrl, this.operator(request).operatorId);
  }

  @Post(':key/uploads')
  @HttpCode(201)
  @ResponseMessage('TutorialUploadStarted')
  @ApiOperation({
    summary: "A signed link to send one part's MP4 to, before it is checked and made live",
  })
  @ApiBody({ type: TutorialUploadStartDto })
  @ZodResponse({ status: 201, type: TutorialUploadDto })
  startUpload(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(tutorialUploadStartSchema)) body: TutorialUploadStartInput,
  ) {
    return this.desk.startUpload(key, body);
  }

  @Put(':key')
  @ResponseMessage('TutorialPublished')
  @ApiOperation({
    summary:
      "Check the sent file (9:16, H.264 and AAC, up to 80 MB) and make it the part's live video, as its next version",
  })
  @ApiBody({ type: TutorialPublishDto })
  @ZodResponse({ type: OperatorTutorialDto })
  publish(
    @Req() request: OperatorSessionRequest,
    @Param('key') key: string,
    @Body(new ZodValidationPipe(tutorialPublishSchema)) body: TutorialPublishInput,
  ) {
    return this.desk.publish(key, body.uploadKey, this.operator(request));
  }

  @Delete(':key')
  @ResponseMessage('TutorialRemoved')
  @ApiOperation({
    summary: "Take the part's video out of every shop's app; its file is deleted 7 days later",
  })
  @ZodResponse({ type: OperatorTutorialDto })
  remove(@Req() request: OperatorSessionRequest, @Param('key') key: string) {
    return this.desk.remove(key, this.operator(request));
  }

  private operator(request: OperatorSessionRequest): TutorialOperator {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return { operatorId: session.operatorId, ip: this.clientIp.resolve(request) };
  }
}

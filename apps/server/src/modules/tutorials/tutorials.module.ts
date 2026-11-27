import { Module } from '@nestjs/common';
import { ClientIp } from '../../common/client-ip';
import { MediaLinks } from '../../common/media-links';
import { DrizzleTutorialStore } from '../../database/adapters/tutorial.adapter';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { MediaModule } from '../media/media.module';
import { OperatorModule } from '../operator/operator.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { OperatorTutorialsController } from './controllers/operator-tutorials.controller';
import { TutorialsController } from './controllers/tutorials.controller';
import { TutorialDesk } from './services/tutorial-desk';
import { TutorialFileSweep } from './services/tutorial-file-sweep';
import { TutorialLibrary } from './services/tutorial-library';
import { TutorialVideoCheck } from './services/tutorial-video-check';
import { TUTORIAL_CLOCK, TUTORIAL_STORE } from './tokens';

// TENANT-DASHBOARD-DESIGN §7.49, §7.49a and OPERATOR-CONSOLE-DESIGN §10h (the owner, 2026-11-27): the in-app tutorial
// videos -- the sellers' rows, player and Menu list, Home's head (read by Home, so exported), the console's page, and the
// nightly deletion of old files. Their files sit in the public media bucket, reached through the media store.
@Module({
  imports: [
    AuditModule,
    IdentityModule,
    MediaModule,
    OperatorModule,
    PlatformSettingsModule,
    TenancyModule,
  ],
  controllers: [TutorialsController, OperatorTutorialsController],
  providers: [
    { provide: TUTORIAL_STORE, useClass: DrizzleTutorialStore },
    { provide: TUTORIAL_CLOCK, useValue: (): Date => new Date() },
    ClientIp,
    MediaLinks,
    TutorialVideoCheck,
    TutorialDesk,
    TutorialLibrary,
    TutorialFileSweep,
  ],
  exports: [TutorialLibrary, TutorialFileSweep],
})
export class TutorialsModule {}

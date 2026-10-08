import { Module } from '@nestjs/common';
import { ENV } from '../../config/tokens';
import type { Env } from '../../config/env';
import { DrizzleOperatorGateway } from '../../database/adapters/operator.adapter';
import { ClientIp } from '../../common/client-ip';
import { TenancyModule } from '../tenancy/tenancy.module';
import { PasswordHasher } from '../identity/services/password-hasher';
import { OperatorAuthController } from './controllers/operator-auth.controller';
import { OperatorSessionGuard } from './guards/operator-session.guard';
import { OperatorAuthService } from './services/operator-auth.service';
import { TotpService } from './services/totp.service';
import { OPERATOR_GATEWAY, OPERATOR_SETTINGS } from './tokens';
import type { OperatorSessionSettings } from './types/session';

// ADM-01, D8: a separate account space from the tenant dashboard (IdentityModule). PasswordHasher is its own
// provider here, not imported from IdentityModule — it is a stateless utility class, and keeping it as a
// second instance avoids coupling the operator console's module graph to the tenant one for no real reason.
// TenancyModule is imported only for ClientIp's EdgeSecret dependency, the same reason IdentityModule imports
// it (TenantGuard, its global APP_GUARD, is already registered once from wherever TenancyModule first loads;
// re-importing it here links to that same instance, and OperatorAuthController's own `@SkipTenant()` exempts
// its routes from it regardless).
@Module({
  imports: [TenancyModule],
  controllers: [OperatorAuthController],
  providers: [
    { provide: OPERATOR_GATEWAY, useClass: DrizzleOperatorGateway },
    {
      provide: OPERATOR_SETTINGS,
      inject: [ENV],
      useFactory: (env: Env): OperatorSessionSettings => ({
        now: (): Date => new Date(),
        secureCookies: env.NODE_ENV === 'production',
      }),
    },
    PasswordHasher,
    TotpService,
    OperatorAuthService,
    OperatorSessionGuard,
    ClientIp,
  ],
  exports: [OperatorAuthService, OperatorSessionGuard],
})
export class OperatorModule {}

import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Dashboard } from '../../../common/decorators/dashboard';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { DashboardGuard } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { PlatformWalletsService } from '../../balance/services/platform-wallets.service';
import type { PlatformWallet } from '../../balance/types/platform-wallet';
import { PlatformWalletDto } from '../dto/balance-response.dto';

// BIL-02/BAL-03: "where do I send the money" for whoever is about to pay for a plan or top up. Deliberately
// no PermissionGuard/RequirePermission -- this is non-sensitive, read-only data needed by any staff member
// about to act on a payment, and gating it behind either BalanceManage or PaymentsManage specifically would
// block a staff member who legitimately holds only the other one. Matches the GET /me precedent
// (IdentitiesController, DataExportController): a signed-in dashboard session is enough.
// `suspendedOwner: true` (LIF-24): the same carve-out balance.controller.ts's own top-up/quote and
// top-up/confirm routes carry, since this is exactly the data those routes need to be useful while suspended.
@ApiTags('Platform Wallets')
@Controller('platform-wallets')
@Dashboard({ suspendedOwner: true })
@UseGuards(SessionGuard, DashboardGuard)
export class PlatformWalletsController {
  constructor(@Inject(PlatformWalletsService) private readonly wallets: PlatformWalletsService) {}

  @Get()
  @ResponseMessage('PlatformWalletsListed')
  @ZodResponse({ type: [PlatformWalletDto] })
  list(): Promise<PlatformWallet[]> {
    return this.wallets.list(true);
  }
}

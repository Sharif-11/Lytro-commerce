import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { AddonCatalogueService } from '../../billing/services/addon-catalogue.service';
import type { PlanOperator } from '../../billing/services/plans.service';
import type { AddonRecord } from '../../billing/types/addon';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import { AddonDto, AddonListDto } from '../dto/addons-response.dto';
import { CreateAddonDto, UpdateAddonDto } from '../dto/billing.dto';

// PLN-13: the operator's add-on catalogue, retired items included.
@ApiTags('Operator Add-ons')
@Controller('operator/addons')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorAddonsController {
  constructor(
    @Inject(AddonCatalogueService) private readonly catalogue: AddonCatalogueService,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Get()
  @ResponseMessage('AddonsListed')
  @ApiOperation({ summary: 'List every add-on, including retired ones' })
  @ZodResponse({ type: AddonListDto })
  list(): Promise<AddonRecord[]> {
    return this.catalogue.listAll();
  }

  @Post()
  @ResponseMessage('AddonCreated')
  @ApiOperation({ summary: 'Add an item to the add-on catalogue' })
  @ApiBody({ type: CreateAddonDto })
  @ZodResponse({ type: AddonDto })
  create(
    @Body(new ZodValidationPipe(CreateAddonDto.schema)) body: CreateAddonDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<AddonRecord> {
    return this.catalogue.create(body, this.operatorOf(request));
  }

  @Patch(':id')
  @ResponseMessage('AddonUpdated')
  @ApiOperation({
    summary: "Change an add-on's price, unit or names (applies to the next purchase)",
  })
  @ApiBody({ type: UpdateAddonDto })
  @ZodResponse({ type: AddonDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateAddonDto.schema)) body: UpdateAddonDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<AddonRecord> {
    return this.catalogue.update(id, body, this.operatorOf(request));
  }

  @Post(':id/retire')
  @HttpCode(200)
  @ResponseMessage('AddonRetired')
  @ApiOperation({ summary: 'Stop selling an add-on; what shops bought runs to its end' })
  @ZodResponse({ type: AddonDto })
  retire(@Param('id') id: string, @Req() request: OperatorSessionRequest): Promise<AddonRecord> {
    return this.catalogue.retire(id, this.operatorOf(request));
  }

  /** ADM-08: who changed the catalogue, for the platform audit log. */
  private operatorOf(request: OperatorSessionRequest): PlanOperator {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return { operatorId: session.operatorId, ip: this.clientIp.resolve(request) };
  }
}

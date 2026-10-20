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
import { Permission } from '@lytronix/validators';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { ApiKeyService } from '../../api-access/services/api-key.service';
import type { ApiKeyView, CreatedApiKeyView } from '../../api-access/types/api-access';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import {
  ApiKeyListDto,
  ApiKeyViewDto,
  CreateApiKeyDto,
  CreatedApiKeyViewDto,
  UpdateApiKeyDto,
} from '../dto/api-keys.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// API-01 to API-03, API-21, API-24: the shop's public API keys, all behind keys:manage.
@ApiTags('API keys')
@Controller('api-keys')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class ApiKeysController {
  constructor(
    @Inject(ApiKeyService) private readonly keys: ApiKeyService,
    @Inject(CatalogueRequest) private readonly request: CatalogueRequest,
  ) {}

  @Get()
  @RequirePermission(Permission.KeysManage)
  @ResponseMessage('ApiKeysListed')
  @ApiOperation({ summary: "The shop's API keys, newest first, revoked ones included (API-01)" })
  @ZodResponse({ type: ApiKeyListDto })
  list(@Req() request: DashboardRequest): Promise<ApiKeyView[]> {
    return this.keys.list(this.request.tenantIdOf(request));
  }

  @Post()
  @RequirePermission(Permission.KeysManage)
  @ResponseMessage('ApiKeyCreated')
  @ApiOperation({
    summary:
      'Make a public key for the website addresses given; its value is in this answer only (API-01, API-02)',
  })
  @ApiBody({ type: CreateApiKeyDto })
  @ZodResponse({ status: 201, type: CreatedApiKeyViewDto })
  create(
    @Body(new ZodValidationPipe(CreateApiKeyDto.schema)) body: CreateApiKeyDto,
    @Req() request: DashboardRequest,
  ): Promise<CreatedApiKeyView> {
    return this.keys.create(this.request.tenantIdOf(request), body, this.request.actorOf(request));
  }

  @Patch(':id')
  @RequirePermission(Permission.KeysManage)
  @ResponseMessage('ApiKeyUpdated')
  @ApiOperation({ summary: "A live key's name or website addresses (API-01, API-08)" })
  @ApiBody({ type: UpdateApiKeyDto })
  @ZodResponse({ type: ApiKeyViewDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateApiKeyDto.schema)) body: UpdateApiKeyDto,
    @Req() request: DashboardRequest,
  ): Promise<ApiKeyView> {
    return this.keys.update(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'ApiKeyNotFound'),
      body,
      this.request.actorOf(request),
    );
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @RequirePermission(Permission.KeysManage)
  @ResponseMessage('ApiKeyRevoked')
  @ApiOperation({
    summary: 'Revoke a key: refused within 5 seconds, kept in the list (API-03, API-24)',
  })
  @ZodResponse({ type: ApiKeyViewDto })
  revoke(@Param('id') id: string, @Req() request: DashboardRequest): Promise<ApiKeyView> {
    return this.keys.revoke(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'ApiKeyNotFound'),
      this.request.actorOf(request),
    );
  }
}

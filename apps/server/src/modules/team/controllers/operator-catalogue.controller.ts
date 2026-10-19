import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { OkDto } from '../../../common/dto/ok.dto';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { PlatformLibraryService } from '../../catalogue/services/platform-library.service';
import type {
  AttributeView,
  OptionSetView,
  OptionView,
  PresetView,
} from '../../catalogue/types/catalogue';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import {
  CreateAttributeDto,
  CreateOptionDto,
  CreatePlatformOptionSetDto,
  UpdateAttributeDto,
  UpdateOptionDto,
  UpdatePlatformOptionSetDto,
  UpdatePresetDto,
} from '../dto/catalogue.dto';
import {
  AttributeViewDto,
  OptionSetViewDto,
  OptionViewDto,
  PresetViewDto,
} from '../dto/catalogue-response.dto';
import { CatalogueRequest } from '../services/catalogue-request';

// PST-04: the operator's editor for the shop-type presets. A change applies to the next product created (PST-03).
@ApiTags('Operator Catalogue')
@Controller('operator/presets')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorPresetsController {
  constructor(
    @Inject(PlatformLibraryService) private readonly library: PlatformLibraryService,
    @Inject(CatalogueRequest) private readonly catalogue: CatalogueRequest,
  ) {}

  @Get()
  @ResponseMessage('PresetsListed')
  @ApiOperation({ summary: 'List the shop-type presets with their defaults and suggestions' })
  @ZodResponse({ type: [PresetViewDto] })
  list(): Promise<PresetView[]> {
    return this.library.listPresets();
  }

  @Patch(':key')
  @ResponseMessage('PresetUpdated')
  @ApiOperation({
    summary:
      "Change a shop type's labels, defaults, suggestions or up-front fields (PST-04, PST-05)",
  })
  @ApiBody({ type: UpdatePresetDto })
  @ZodResponse({ type: PresetViewDto })
  update(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(UpdatePresetDto.schema)) body: UpdatePresetDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<PresetView> {
    return this.library.updatePreset(key, body, this.catalogue.operatorOf(request));
  }
}

// ATL-01, ATR-18: the operator's curation of the platform's attributes and their values, with swatches.
@ApiTags('Operator Catalogue')
@Controller('operator/attributes')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorAttributesController {
  constructor(
    @Inject(PlatformLibraryService) private readonly library: PlatformLibraryService,
    @Inject(CatalogueRequest) private readonly catalogue: CatalogueRequest,
  ) {}

  @Get()
  @ResponseMessage('AttributesListed')
  @ApiOperation({ summary: "List the platform's attributes with their values, retired ones too" })
  @ZodResponse({ type: [AttributeViewDto] })
  list(): Promise<AttributeView[]> {
    return this.library.listAttributes();
  }

  @Post()
  @ResponseMessage('AttributeCreated')
  @ApiOperation({ summary: 'Add a platform attribute every shop sees (ATL-01)' })
  @ApiBody({ type: CreateAttributeDto })
  @ZodResponse({ type: AttributeViewDto })
  create(
    @Body(new ZodValidationPipe(CreateAttributeDto.schema)) body: CreateAttributeDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<AttributeView> {
    return this.library.createAttribute(body, this.catalogue.operatorOf(request));
  }

  @Patch(':id')
  @ResponseMessage('AttributeUpdated')
  @ApiOperation({ summary: 'Rename or retire a platform attribute' })
  @ApiBody({ type: UpdateAttributeDto })
  @ZodResponse({ type: AttributeViewDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateAttributeDto.schema)) body: UpdateAttributeDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<AttributeView> {
    return this.library.updateAttribute(
      this.catalogue.idOf(id, 'AttributeNotFound'),
      body,
      this.catalogue.operatorOf(request),
    );
  }

  @Post(':id/options')
  @ResponseMessage('OptionCreated')
  @ApiOperation({ summary: 'Add a platform value, optionally with a swatch (ATR-18)' })
  @ApiBody({ type: CreateOptionDto })
  @ZodResponse({ type: OptionViewDto })
  addOption(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateOptionDto.schema)) body: CreateOptionDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<OptionView> {
    return this.library.addOption(
      this.catalogue.idOf(id, 'AttributeNotFound'),
      body,
      this.catalogue.operatorOf(request),
    );
  }

  @Patch(':id/options/:optionId')
  @ResponseMessage('OptionUpdated')
  @ApiOperation({ summary: 'Rename, re-colour or retire a platform value' })
  @ApiBody({ type: UpdateOptionDto })
  @ZodResponse({ type: OptionViewDto })
  updateOption(
    @Param('id') id: string,
    @Param('optionId') optionId: string,
    @Body(new ZodValidationPipe(UpdateOptionDto.schema)) body: UpdateOptionDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<OptionView> {
    return this.library.updateOption(
      this.catalogue.idOf(id, 'AttributeNotFound'),
      this.catalogue.idOf(optionId, 'OptionNotFound'),
      body,
      this.catalogue.operatorOf(request),
    );
  }
}

// ATR-16: the operator's curation of the platform's option sets.
@ApiTags('Operator Catalogue')
@Controller('operator/option-sets')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorOptionSetsController {
  constructor(
    @Inject(PlatformLibraryService) private readonly library: PlatformLibraryService,
    @Inject(CatalogueRequest) private readonly catalogue: CatalogueRequest,
  ) {}

  @Get()
  @ResponseMessage('OptionSetsListed')
  @ApiOperation({ summary: "List the platform's option sets" })
  @ZodResponse({ type: [OptionSetViewDto] })
  list(): Promise<OptionSetView[]> {
    return this.library.listOptionSets();
  }

  @Post()
  @ResponseMessage('OptionSetCreated')
  @ApiOperation({ summary: 'Add a platform option set, optionally offered first to one shop type' })
  @ApiBody({ type: CreatePlatformOptionSetDto })
  @ZodResponse({ type: OptionSetViewDto })
  create(
    @Body(new ZodValidationPipe(CreatePlatformOptionSetDto.schema))
    body: CreatePlatformOptionSetDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<OptionSetView> {
    return this.library.createOptionSet(body, this.catalogue.operatorOf(request));
  }

  @Patch(':id')
  @ResponseMessage('OptionSetUpdated')
  @ApiOperation({ summary: 'Rename a platform option set or change its values or shop type' })
  @ApiBody({ type: UpdatePlatformOptionSetDto })
  @ZodResponse({ type: OptionSetViewDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePlatformOptionSetDto.schema))
    body: UpdatePlatformOptionSetDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<OptionSetView> {
    return this.library.updateOptionSet(
      this.catalogue.idOf(id, 'OptionSetNotFound'),
      body,
      this.catalogue.operatorOf(request),
    );
  }

  @Delete(':id')
  @ResponseMessage('OptionSetDeleted')
  @ApiOperation({ summary: 'Delete a platform option set; values already inserted from it stay' })
  @ZodResponse({ type: OkDto })
  async remove(
    @Param('id') id: string,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ ok: true }> {
    await this.library.deleteOptionSet(
      this.catalogue.idOf(id, 'OptionSetNotFound'),
      this.catalogue.operatorOf(request),
    );
    return { ok: true };
  }
}

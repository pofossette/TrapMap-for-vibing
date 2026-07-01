import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import type { KnowledgeReadPort } from '@trapmap/backend-core';

import { ZodBodyValidationPipe } from "@trapmap/host-local/nest/runtime/validation.pipe.js";
import { AuthGuard } from "@trapmap/host-local/nest/runtime/auth.guard.js";
import { KNOWLEDGE_READ_PORT } from "@trapmap/host-local/nest/knowledge-read/knowledge-read.tokens.js";

import { searchBodySchema } from './gateway.schemas.js';

/**
 * Gateway controller for the knowledge-read pilot surface.
 *
 * Controllers do NOT rewrite business logic — they delegate to
 * the injected KnowledgeReadPort (backend-core port interface).
 *
 * Pilot routes:
 * - GET  /v1/knowledge/:entryId
 * - GET  /v1/knowledge/mine
 * - POST /v1/retrieval/search
 * - GET  /v1/knowledge/projection-status
 */
@Controller('v1')
@UseGuards(AuthGuard)
export class KnowledgeReadController {
  constructor(
    @Inject(KNOWLEDGE_READ_PORT)
    private readonly knowledgeRead: KnowledgeReadPort,
  ) {}

  @Get('knowledge/:entryId')
  async getById(@Param('entryId') entryId: string) {
    const entry = await this.knowledgeRead.getById(entryId);
    if (!entry) {
      throw new HttpException('Knowledge entry not found', HttpStatus.NOT_FOUND);
    }
    return entry;
  }

  @Get('knowledge/mine')
  async listMine(
    @Query('userId') userId: string,
    @Query('teamId') teamId?: string,
  ) {
    if (!userId) {
      throw new HttpException('userId query parameter is required', HttpStatus.BAD_REQUEST);
    }
    return this.knowledgeRead.listMine(userId, teamId);
  }

  @Post('retrieval/search')
  @HttpCode(200)
  async search(
    @Body(new ZodBodyValidationPipe(searchBodySchema))
    body: { query: string; teamId?: string; limit?: number },
  ) {
    return this.knowledgeRead.search(body);
  }

  @Get('knowledge/projection-status')
  async getProjectionStatus() {
    return this.knowledgeRead.getProjectionStatus();
  }
}

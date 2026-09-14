import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import { parseInteger, parseString } from '../../common/http/query.js';
import type { Paginated, UserSummary } from '../../contracts/index.js';
import type { UserEntity } from '../../entities/index.js';
import {
  HighfivesService,
  type HighfiveToggleResponse,
} from './highfives.service.js';

@Controller('projects/:slug')
export class HighfivesController {
  constructor(private readonly highfives: HighfivesService) {}

  @Post('highfive')
  @HttpCode(200)
  give(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
  ): Promise<HighfiveToggleResponse> {
    return this.highfives.give(slug, user);
  }

  @Delete('highfive')
  withdraw(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
  ): Promise<HighfiveToggleResponse> {
    return this.highfives.withdraw(slug, user);
  }

  @Public()
  @Get('highfives')
  list(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity | undefined,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Paginated<UserSummary>> {
    return this.highfives.list(
      slug,
      user,
      parseString(cursor),
      parseInteger(limit),
    );
  }
}

import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import { ZodBody } from '../../common/http/zod.pipe.js';
import {
  commentCreateInputSchema,
  type Comment as CommentDto,
  type CommentCreateInput,
} from '../../contracts/index.js';
import type { UserEntity } from '../../entities/index.js';
import { CommentsService, type CommentWithAuthor } from './comments.service.js';

@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Public()
  @Get('projects/:slug/comments')
  list(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity | undefined,
  ): Promise<CommentWithAuthor[]> {
    return this.comments.list(slug, user);
  }

  @Post('projects/:slug/comments')
  @HttpCode(201)
  create(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(commentCreateInputSchema) input: CommentCreateInput,
  ): Promise<CommentDto> {
    return this.comments.create(slug, user, input);
  }

  @Post('comments/:commentId/hide')
  @HttpCode(204)
  hide(
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<void> {
    return this.comments.hide(user, commentId);
  }

  @Delete('comments/:commentId')
  @HttpCode(204)
  remove(
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<void> {
    return this.comments.remove(user, commentId);
  }
}

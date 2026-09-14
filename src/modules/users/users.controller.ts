import {
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import { ZodBody } from '../../common/http/zod.pipe.js';
import {
  assertAllowed,
  assertSize,
  detectMimeType,
  requireFile,
  type UploadedFile as Upload,
} from '../../common/http/upload.js';
import { StorageService } from '../../common/storage/storage.service.js';
import {
  userProfileUpdateInputSchema,
  type CurrentUser as CurrentUserDto,
  type User,
  type UserProfileUpdateInput,
  type UserSummary,
} from '../../contracts/index.js';
import type { UserEntity } from '../../entities/index.js';
import { UsersService, type UserProjectsResponse } from './users.service.js';

/** Un avatar reste petit : 5 Mo suffisent largement, et bornent l'abus. */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

@Controller()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly storage: StorageService,
  ) {}

  @Public()
  @Get('users/:username')
  getProfile(@Param('username') username: string): Promise<User> {
    return this.users.getPublicProfile(username);
  }

  @Public()
  @Get('users/:username/projects')
  getProjects(
    @Param('username') username: string,
  ): Promise<UserProjectsResponse> {
    return this.users.listUserProjects(username);
  }

  @Public()
  @Get('feed/people')
  suggestedPeople(
    @CurrentUser() user: UserEntity | undefined,
  ): Promise<UserSummary[]> {
    return this.users.listSuggestedPeople(user?.id);
  }

  @Patch('me')
  update(
    @CurrentUser() user: UserEntity,
    @ZodBody(userProfileUpdateInputSchema) input: UserProfileUpdateInput,
  ): Promise<CurrentUserDto> {
    return this.users.updateProfile(user, input);
  }

  @Post('me/avatar')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('avatar'))
  async uploadAvatar(
    @CurrentUser() user: UserEntity,
    @UploadedFile() uploaded?: Upload,
  ): Promise<{ avatar: string }> {
    const file = requireFile(uploaded);
    assertSize(file.size, MAX_AVATAR_BYTES);

    const mimeType = detectMimeType(file);
    assertAllowed(mimeType, ['image/'], []);

    const { url } = await this.storage.put(
      `avatars/${user.id}`,
      file.originalname,
      file.buffer,
      mimeType,
    );
    return { avatar: await this.users.setAvatar(user, url) };
  }
}

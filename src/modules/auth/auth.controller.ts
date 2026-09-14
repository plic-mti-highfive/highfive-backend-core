import { Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import { ZodBody } from '../../common/http/zod.pipe.js';
import {
  loginInputSchema,
  passwordResetInputSchema,
  passwordResetRequestInputSchema,
  registerInputSchema,
  type CurrentUser as CurrentUserDto,
  type LoginInput,
  type PasswordResetInput,
  type PasswordResetRequestInput,
  type RegisterInput,
  type Session,
} from '../../contracts/index.js';
import type { UserEntity } from '../../entities/index.js';
import { toCurrentUser } from '../../common/mappers/index.js';
import { AuthService } from './auth.service.js';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('auth/login')
  @HttpCode(200)
  login(@ZodBody(loginInputSchema) input: LoginInput): Promise<Session> {
    return this.auth.login(input);
  }

  @Public()
  @Post('auth/register')
  @HttpCode(201)
  register(
    @ZodBody(registerInputSchema) input: RegisterInput,
  ): Promise<Session> {
    return this.auth.register(input);
  }

  @Post('auth/logout')
  @HttpCode(204)
  async logout(
    @Headers('authorization') authorization?: string,
  ): Promise<void> {
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined;
    await this.auth.logout(token);
  }

  /** `GET /api/me` — la session courante, avec les champs prives. */
  @Get('me')
  me(@CurrentUser() user: UserEntity): CurrentUserDto {
    return toCurrentUser(user);
  }

  @Public()
  @Post('auth/password-reset-request')
  @HttpCode(204)
  async requestPasswordReset(
    @ZodBody(passwordResetRequestInputSchema)
    input: PasswordResetRequestInput,
  ): Promise<void> {
    await this.auth.requestPasswordReset(input);
  }

  @Public()
  @Post('auth/password-reset')
  @HttpCode(204)
  async resetPassword(
    @ZodBody(passwordResetInputSchema) input: PasswordResetInput,
  ): Promise<void> {
    await this.auth.resetPassword(input);
  }
}

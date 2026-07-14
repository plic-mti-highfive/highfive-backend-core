import { Controller, Post, Get, Body } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { UserResponseDto } from '../users/dto/user-response.dto.js';
import { TenantId } from '../../shared/tenant/tenant.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import type { AuthUser } from '../../shared/auth/authenticated-user.interface.js';

@ApiTags('Auth')
@Controller('auth')
@ApiSecurity('tenant')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  register(@TenantId() tenantId: string, @Body() dto: RegisterDto) {
    return this.authService.register(tenantId, dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  login(@TenantId() tenantId: string, @Body() dto: LoginDto) {
    return this.authService.login(tenantId, dto);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@TenantId() tenantId: string, @Body() dto: RefreshTokenDto) {
    return this.authService.refresh(tenantId, dto.refreshToken);
  }

  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout (revoke refresh token)' })
  logout(@TenantId() tenantId: string, @Body() dto: RefreshTokenDto) {
    return this.authService.logout(tenantId, dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user info' })
  me(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<UserResponseDto> {
    return this.authService.getProfile(tenantId, user.id);
  }
}

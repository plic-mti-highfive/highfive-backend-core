import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptionsWithRequest } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { SystemRole } from './system-role.enum.js';
import { AuthUser } from './authenticated-user.interface.js';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: SystemRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const opts: StrategyOptionsWithRequest = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret')!,
      passReqToCallback: true,
    };
    super(opts);
  }

  validate(
    req: Request & { tenantId?: string },
    payload: JwtPayload,
  ): AuthUser {
    if (req.tenantId && payload.tenantId !== req.tenantId) {
      throw new UnauthorizedException('Token tenant mismatch');
    }
    return {
      id: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
      role: payload.role ?? SystemRole.USER,
    };
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptionsWithRequest } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
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

  validate(req: Request & { tenantId?: string }, payload: JwtPayload) {
    if (req.tenantId && payload.tenantId !== req.tenantId) {
      throw new UnauthorizedException('Token tenant mismatch');
    }
    return {
      id: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
    };
  }
}

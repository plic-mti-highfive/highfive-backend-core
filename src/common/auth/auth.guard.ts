import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../errors/api-error.js';
import { IS_ADMIN, IS_PUBLIC, type RequestWithUser } from './decorators.js';
import { SessionService } from './session.service.js';

/**
 * Garde globale : resout le jeton porteur s'il y en a un, puis verifie ce que
 * la route exige.
 *
 * Le jeton est resolu meme sur une route `@Public()` : la visibilite d'un
 * projet ou les sections de Decouvrir dependent du lecteur, et il serait
 * absurde de dupliquer une route par etat de connexion.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = extractBearer(request.headers.authorization);

    if (token) {
      const user = await this.sessions.resolve(token);
      if (user) request.user = user;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isAdmin = this.reflector.getAllAndOverride<boolean>(IS_ADMIN, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!request.user && !isPublic) throw ApiError.unauthorized();
    if (isAdmin && request.user?.platformRole !== 'admin') {
      if (!request.user) throw ApiError.unauthorized();
      throw ApiError.forbidden("Cet espace est reserve a l'administration.");
    }

    return true;
  }
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}

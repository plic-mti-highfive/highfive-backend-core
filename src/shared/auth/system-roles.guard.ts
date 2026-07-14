import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { SYSTEM_ROLES_KEY } from '../decorators/system-roles.decorator.js';
import { SystemRole } from './system-role.enum.js';
import { AuthUser } from './authenticated-user.interface.js';

/**
 * Guard global de rôle plateforme. N'intervient que sur les handlers décorés
 * via `@SystemRoles(...)` ; sinon il laisse passer (l'authentification reste
 * assurée par `JwtAuthGuard`). À enregistrer APRÈS `JwtAuthGuard` pour que
 * `request.user` soit déjà peuplé.
 */
@Injectable()
export class SystemRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<SystemRole[]>(
      SYSTEM_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const user = request.user;

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient platform role');
    }

    return true;
  }
}

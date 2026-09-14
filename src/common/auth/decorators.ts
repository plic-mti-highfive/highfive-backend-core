import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserEntity } from '../../entities/index.js';

/**
 * Route accessible sans jeton. Le jeton reste lu et resolu s'il est present :
 * plusieurs routes publiques changent de reponse selon le lecteur (fiche d'un
 * projet prive, sections personnalisees de Decouvrir).
 */
export const IS_PUBLIC = 'highfive:public';
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC, true);

/** Route reservee au role plateforme `admin` (401 si anonyme, 403 sinon). */
export const IS_ADMIN = 'highfive:admin';
export const AdminOnly = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_ADMIN, true);

export interface RequestWithUser extends Request {
  user?: UserEntity;
}

/**
 * `@CurrentUser() user: UserEntity` sur une route authentifiee,
 * `@CurrentUser() user: UserEntity | undefined` sur une route `@Public()`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): UserEntity | undefined =>
    context.switchToHttp().getRequest<RequestWithUser>().user,
);

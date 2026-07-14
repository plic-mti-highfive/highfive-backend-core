import { SetMetadata } from '@nestjs/common';
import { SystemRole } from '../auth/system-role.enum.js';

export const SYSTEM_ROLES_KEY = 'system_roles';

/**
 * Restreint un handler/controller aux rôles plateforme indiqués.
 * Évalué par `SystemRolesGuard` (enregistré globalement). Exemple :
 *
 *   @SystemRoles(SystemRole.ADMIN)
 */
export const SystemRoles = (...roles: SystemRole[]) =>
  SetMetadata(SYSTEM_ROLES_KEY, roles);

import { SystemRole } from './system-role.enum.js';

/**
 * Forme de `request.user` après validation du JWT (cf. JwtStrategy).
 * Exposée aux controllers via le décorateur `@CurrentUser()`.
 */
export interface AuthUser {
  id: string;
  email: string;
  tenantId: string;
  role: SystemRole;
}

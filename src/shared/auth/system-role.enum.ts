/**
 * Rôle plateforme (global), porté par le User — distinct de `ProjectRole`
 * (shared-types) qui est scopé par projet.
 *
 * - USER  : utilisateur standard.
 * - ADMIN : administrateur plateforme (accès au dashboard admin).
 *
 * Volontairement local au backend : modifier `@plic-mti-highfive/shared-types`
 * imposerait un rebuild/republish cross-repo, hors scope du backend core.
 */
export enum SystemRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

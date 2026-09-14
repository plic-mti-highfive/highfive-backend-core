import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';

/**
 * Personne (doc 04 section 2). `username` est l'identifiant public et la
 * route (`/u/:username`, R-P3) ; `accountStatus` et `platformRole` ne
 * sortent jamais sur un profil public, seulement sur `CurrentUser` (/api/me).
 */
export const usernameSchema = z
  .string()
  .min(3)
  .max(24)
  .regex(
    /^[a-z0-9._-]+$/,
    '3 a 24 caracteres, lettres minuscules, chiffres, . _ -',
  );

export const accountStatusSchema = z.enum(['active', 'suspended', 'deleted']);
export type AccountStatus = z.infer<typeof accountStatusSchema>;

export const platformRoleSchema = z.enum(['member', 'admin']);
export type PlatformRole = z.infer<typeof platformRoleSchema>;

/** Version minimale utilisee dans les listes (membres, auteurs, mentions...). */
export const userSummarySchema = z.object({
  id: idSchema,
  username: usernameSchema,
  displayName: z.string().min(1).max(40).optional(),
  avatar: z.url(),
});
export type UserSummary = z.infer<typeof userSummarySchema>;

/** Profil public d'une personne (`/api/users/:username`). */
export const userSchema = z.object({
  id: idSchema,
  username: usernameSchema,
  displayName: z.string().min(1).max(40).optional(),
  avatar: z.url(),
  bio: z.string().max(280).optional(),
  interests: z.array(z.string()).max(10).default([]),
  createdAt: isoDateTimeSchema,
});
export type User = z.infer<typeof userSchema>;

/** Session utilisateur (`/api/me`) : ajoute les champs prives au profil public. */
export const currentUserSchema = userSchema.extend({
  email: z.email(),
  accountStatus: accountStatusSchema,
  platformRole: platformRoleSchema,
  lastVisitAt: isoDateTimeSchema,
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export const userProfileUpdateInputSchema = z.object({
  displayName: z.string().min(1).max(40).optional(),
  bio: z.string().max(280).optional(),
  interests: z.array(z.string()).max(10).optional(),
});
export type UserProfileUpdateInput = z.infer<
  typeof userProfileUpdateInputSchema
>;

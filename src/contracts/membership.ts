import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';

/**
 * Appartenance (doc 04 section 5). R-M1 : exactement un `owner` par projet a
 * tout instant — verifie par integrite referentielle dans les tests du jeu
 * de demo, pas par ce schema unitaire.
 */
export const membershipRoleSchema = z.enum([
  'owner',
  'co_owner',
  'member',
  'observer',
]);
export type MembershipRole = z.infer<typeof membershipRoleSchema>;

export const membershipSchema = z.object({
  projectId: idSchema,
  userId: idSchema,
  role: membershipRoleSchema,
  joinedAt: isoDateTimeSchema,
  blocked: z.boolean().default(false),
});
export type Membership = z.infer<typeof membershipSchema>;

/** Demande de rejoindre (doc 04 section 6). */
export const joinRequestStatusSchema = z.enum([
  'pending',
  'accepted',
  'rejected',
]);
export type JoinRequestStatus = z.infer<typeof joinRequestStatusSchema>;

export const joinRequestSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  userId: idSchema,
  message: z.string().max(300).optional(),
  status: joinRequestStatusSchema,
  createdAt: isoDateTimeSchema,
});
export type JoinRequest = z.infer<typeof joinRequestSchema>;

export const joinRequestCreateInputSchema = z.object({
  message: z.string().max(300).optional(),
});
export type JoinRequestCreateInput = z.infer<
  typeof joinRequestCreateInputSchema
>;

/** Invitation (doc 04 section 6). R-I1 : expiration a 30 jours. */
export const invitationStatusSchema = z.enum([
  'pending',
  'accepted',
  'rejected',
  'expired',
]);
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

export const invitationSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  senderId: idSchema,
  recipientId: idSchema,
  proposedRole: membershipRoleSchema.exclude(['owner']),
  message: z.string().max(300).optional(),
  status: invitationStatusSchema,
  expiresAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
});
export type Invitation = z.infer<typeof invitationSchema>;

export const invitationCreateInputSchema = z.object({
  recipientId: idSchema,
  proposedRole: membershipRoleSchema.exclude(['owner']),
  message: z.string().max(300).optional(),
});
export type InvitationCreateInput = z.infer<typeof invitationCreateInputSchema>;

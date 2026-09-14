import { z } from 'zod';
import { idSchema, isoDateTimeSchema, slugSchema } from './common.js';
import { userSummarySchema } from './user.js';

/**
 * Signalement et moderation (doc 04 section 15). R-S1 : motifs enumeres.
 * R-S2 : trois signalements distincts sur une meme cible la remontent en
 * tete de file (calcule cote handler, pas dans ce schema).
 */
export const reportReasonSchema = z.enum([
  'hateful_content',
  'harassment',
  'scam',
  'sexual_content',
  'spam',
  'other',
]);
export type ReportReason = z.infer<typeof reportReasonSchema>;

export const reportTargetTypeSchema = z.enum([
  'project',
  'comment',
  'message',
  'user',
]);
export type ReportTargetType = z.infer<typeof reportTargetTypeSchema>;

export const reportStatusSchema = z.enum(['new', 'handled', 'rejected']);
export type ReportStatus = z.infer<typeof reportStatusSchema>;

export const reportSchema = z.object({
  id: idSchema,
  reporterId: idSchema,
  targetType: reportTargetTypeSchema,
  targetId: idSchema,
  reason: reportReasonSchema,
  detail: z.string().max(1000).optional(),
  status: reportStatusSchema,
  handledBy: idSchema.optional(),
  createdAt: isoDateTimeSchema,
});
export type Report = z.infer<typeof reportSchema>;

export const reportCreateInputSchema = z.object({
  targetType: reportTargetTypeSchema,
  targetId: idSchema,
  reason: reportReasonSchema,
  detail: z.string().max(1000).optional(),
});
export type ReportCreateInput = z.infer<typeof reportCreateInputSchema>;

/**
 * Apercu de la cible d'un signalement, pour l'ecran de moderation (doc 15
 * E-35 : "le contenu signale est montre en entier, avec son contexte"). Tous
 * les champs sont optionnels : construit au mieux depuis ce que le store
 * mock sait joindre (auteur, extrait, projet), jamais invente.
 */
export const reportTargetPreviewSchema = z.object({
  author: userSummarySchema.optional(),
  excerpt: z.string().max(1000).optional(),
  projectTitle: z.string().optional(),
  projectSlug: slugSchema.optional(),
});
export type ReportTargetPreview = z.infer<typeof reportTargetPreviewSchema>;

/**
 * Version pour la file de moderation (`GET /admin/reports`) : le
 * signalement brut, augmente du profil du signaleur, d'un apercu de la
 * cible et du nombre de signalements distincts sur la meme cible (R-S2).
 */
export const reportSummarySchema = reportSchema.extend({
  reporter: userSummarySchema,
  target: reportTargetPreviewSchema.optional(),
  similarReportsCount: z.number().int().positive(),
});
export type ReportSummary = z.infer<typeof reportSummarySchema>;

/** Journal d'action d'administration (R-S4), inalterable. */
export const adminActionTypeSchema = z.enum([
  'suspend_account',
  'reactivate_account',
  'delete_project',
  'hide_comment',
  'reject_report',
  'resolve_report',
]);
export type AdminActionType = z.infer<typeof adminActionTypeSchema>;

export const adminActionSchema = z.object({
  id: idSchema,
  adminId: idSchema,
  type: adminActionTypeSchema,
  targetType: reportTargetTypeSchema,
  targetId: idSchema,
  reason: z.string().max(1000).optional(),
  createdAt: isoDateTimeSchema,
});
export type AdminAction = z.infer<typeof adminActionSchema>;

/** Chiffres pour l'administration (doc 23 section 11) : jamais inventes flatteurs. */
export const adminStatsSchema = z.object({
  usersCount: z.number().int().nonnegative(),
  onlineCount: z.number().int().nonnegative(),
  activeProjectsCount: z.number().int().nonnegative(),
  doneProjectsCount: z.number().int().nonnegative(),
  archivedProjectsCount: z.number().int().nonnegative(),
  pendingReportsCount: z.number().int().nonnegative(),
  signupsLast30Days: z.array(
    z.object({ date: z.iso.date(), count: z.number().int().nonnegative() }),
  ),
});
export type AdminStats = z.infer<typeof adminStatsSchema>;

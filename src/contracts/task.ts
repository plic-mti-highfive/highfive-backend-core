import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import { tagAccentSchema } from './tag.js';

/**
 * Colonne des Tâches (doc 04 section 11). R-K1 : 3 colonnes par defaut
 * (A faire, En cours, Fait). R-K2 : de 1 a 6 colonnes par projet.
 */
export const columnSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  label: z.string().min(1).max(24),
  order: z.number().int().nonnegative(),
  color: tagAccentSchema.optional(),
});
export type Column = z.infer<typeof columnSchema>;

export const columnCreateInputSchema = z.object({
  label: z.string().min(1).max(24),
  color: tagAccentSchema.optional(),
});
export type ColumnCreateInput = z.infer<typeof columnCreateInputSchema>;

/**
 * Tache (doc 04 section 11). R-K4 : aucun champ obligatoire hors titre.
 * Pas de priorite : le doc n'en definit pas (ecart volontaire vs l'ancien
 * KanbanTicket qui en portait une).
 */
export const taskSchema = z.object({
  id: idSchema,
  columnId: idSchema,
  title: z.string().min(1).max(120),
  details: z.string().max(1000).optional(),
  assigneeIds: z.array(idSchema).default([]),
  dueDate: z.iso.date().optional(),
  order: z.number().int().nonnegative(),
  createdBy: idSchema,
  createdAt: isoDateTimeSchema,
  wallOriginId: z.string().optional(),
});
export type Task = z.infer<typeof taskSchema>;

export const taskCreateInputSchema = z.object({
  columnId: idSchema,
  title: z.string().min(1).max(120),
  details: z.string().max(1000).optional(),
  assigneeIds: z.array(idSchema).optional(),
  dueDate: z.iso.date().optional(),
});
export type TaskCreateInput = z.infer<typeof taskCreateInputSchema>;

export const taskUpdateInputSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  details: z.string().max(1000).optional(),
  assigneeIds: z.array(idSchema).optional(),
  dueDate: z.iso.date().nullable().optional(),
});
export type TaskUpdateInput = z.infer<typeof taskUpdateInputSchema>;

/** Deplacement d'une tache d'une colonne a l'autre ou dans la meme colonne. */
export const taskMoveInputSchema = z.object({
  columnId: idSchema,
  order: z.number().int().nonnegative(),
});
export type TaskMoveInput = z.infer<typeof taskMoveInputSchema>;

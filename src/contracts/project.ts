import { z } from 'zod';
import { idSchema, isoDateTimeSchema, slugSchema } from './common.js';
import { userSummarySchema } from './user.js';

/**
 * Projet (doc 04 section 3). Deux axes independants (jamais un seul enum) :
 * `visibility` et `participation`. R-PR1 : `private` force
 * `participation = on_invite`, verifie par les `.refine` ci-dessous.
 */
export const visibilitySchema = z.enum(['public', 'private']);
export type Visibility = z.infer<typeof visibilitySchema>;

export const participationSchema = z.enum(['open', 'on_request', 'on_invite']);
export type Participation = z.infer<typeof participationSchema>;

export const projectStateSchema = z.enum([
  'draft',
  'active',
  'done',
  'archived',
]);
export type ProjectState = z.infer<typeof projectStateSchema>;

/** Besoin (doc 04 section 4) : jamais une offre d'emploi (R-B1). */
export const needSchema = z.object({
  id: idSchema,
  label: z.string().min(3).max(40),
  tagId: z.string().optional(),
  fulfilled: z.boolean().default(false),
});
export type Need = z.infer<typeof needSchema>;

/** R-PR1 : `private` implique `participation = on_invite`. */
function assertVisibilityParticipation(
  visibility: Visibility | undefined,
  participation: Participation | undefined,
  ctx: z.RefinementCtx,
) {
  if (
    visibility === 'private' &&
    participation &&
    participation !== 'on_invite'
  ) {
    ctx.addIssue({
      code: 'custom',
      message:
        "R-PR1 : un projet prive n'accepte que la participation sur_invitation",
      path: ['participation'],
    });
  }
}

const projectBaseFields = {
  id: idSchema,
  slug: slugSchema,
  title: z.string().min(3).max(70),
  tagline: z.string().min(1).max(140),
  description: z.string().max(5000).optional(),
  tags: z.array(z.string()).min(1).max(5),
  needs: z.array(needSchema).max(6).default([]),
  visibility: visibilitySchema,
  participation: participationSchema,
  state: projectStateSchema,
  ownerId: idSchema,
  highfiveCount: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  lastActivityAt: isoDateTimeSchema,
};

export const projectSchema = z
  .object(projectBaseFields)
  .superRefine((project, ctx) =>
    assertVisibilityParticipation(
      project.visibility,
      project.participation,
      ctx,
    ),
  );
export type Project = z.infer<typeof projectSchema>;

/**
 * Version condensee pour les cartes (fil, recherche, profil). `needs` et
 * `teamPreview` ajoutes (additif, V2-4 respecte : aucun champ existant
 * renomme/retire) pour que `ProjectCard` puisse trancher en 10 s (doc 01
 * §5/doc 11 C1) sans requete supplementaire : besoins non pourvus et visages
 * de l'equipe. Voir docs/v2/API-ROUTES.md "Ecarts vs le modele de domaine".
 */
export const projectSummarySchema = z.object({
  id: idSchema,
  slug: slugSchema,
  title: z.string().min(3).max(70),
  tagline: z.string().min(1).max(140),
  tags: z.array(z.string()).min(1).max(5),
  needs: z.array(needSchema).max(6).default([]),
  visibility: visibilitySchema,
  participation: participationSchema,
  state: projectStateSchema,
  highfiveCount: z.number().int().nonnegative(),
  membersCount: z.number().int().nonnegative(),
  /** Porteur + quelques membres, pour l'AvatarGroup de la carte (max 6). */
  teamPreview: z.array(userSummarySchema).max(6).default([]),
  owner: userSummarySchema,
});
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

/** R-PR3 : passer en `actif` exige titre, accroche, un tag — deja garanti par les bornes ci-dessous. */
export const projectCreateInputSchema = z
  .object({
    title: z.string().min(3).max(70),
    tagline: z.string().min(1).max(140),
    description: z.string().max(5000).optional(),
    tags: z.array(z.string()).min(1).max(5),
    needs: z
      .array(needSchema.omit({ id: true, fulfilled: true }))
      .max(6)
      .optional(),
    visibility: visibilitySchema,
    participation: participationSchema,
  })
  .superRefine((input, ctx) =>
    assertVisibilityParticipation(input.visibility, input.participation, ctx),
  );
export type ProjectCreateInput = z.infer<typeof projectCreateInputSchema>;

export const projectUpdateInputSchema = z
  .object({
    title: z.string().min(3).max(70).optional(),
    tagline: z.string().min(1).max(140).optional(),
    description: z.string().max(5000).optional(),
    tags: z.array(z.string()).min(1).max(5).optional(),
    needs: z.array(needSchema).max(6).optional(),
    visibility: visibilitySchema.optional(),
    participation: participationSchema.optional(),
  })
  .superRefine((input, ctx) =>
    assertVisibilityParticipation(input.visibility, input.participation, ctx),
  );
export type ProjectUpdateInput = z.infer<typeof projectUpdateInputSchema>;

/** R-PR3 : transitions d'etat explicites plutot qu'un PATCH `state` libre. */
export const projectTransitionSchema = z.enum([
  'publish',
  'complete',
  'reopen',
  'archive',
  'reactivate',
]);
export type ProjectTransition = z.infer<typeof projectTransitionSchema>;

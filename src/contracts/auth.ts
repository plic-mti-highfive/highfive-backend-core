import { z } from 'zod';
import { currentUserSchema, usernameSchema } from './user.js';

export const loginInputSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const registerInputSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
  username: usernameSchema,
  displayName: z.string().min(1).max(40).optional(),
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

/** Reponse de connexion/inscription : session + jeton porte par le client fetch. */
export const sessionSchema = z.object({
  user: currentUserSchema,
  token: z.string(),
});
export type Session = z.infer<typeof sessionSchema>;

export const passwordResetRequestInputSchema = z.object({
  email: z.email(),
});
export type PasswordResetRequestInput = z.infer<
  typeof passwordResetRequestInputSchema
>;

export const passwordResetInputSchema = z.object({
  token: z.string(),
  password: z.string().min(8).max(128),
});
export type PasswordResetInput = z.infer<typeof passwordResetInputSchema>;

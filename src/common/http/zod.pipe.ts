import { Body, PipeTransform, Query } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ApiError } from '../errors/api-error.js';

/**
 * Validation des corps de requete par les schemas zod du contrat
 * (`src/contracts/`), pas par une reimplementation (SPEC.md §1.7). C'est
 * exactement ce que fait chaque handler MSW cote front : meme schema, meme
 * verdict.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(
    private readonly schema: ZodType<T>,
    private readonly what: 'corps' | 'parametres' = 'corps',
  ) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw ApiError.validation(
        this.what === 'corps'
          ? "Le contenu envoye n'est pas valide."
          : 'Les parametres de la requete ne sont pas valides.',
        parsed.error.issues,
      );
    }
    return parsed.data;
  }
}

/** `@ZodBody(projectCreateInputSchema) input: ProjectCreateInput`. */
export const ZodBody = <T>(schema: ZodType<T>): ParameterDecorator =>
  Body(new ZodValidationPipe(schema, 'corps'));

/** Idem pour la chaine de requete, une fois les chaines converties. */
export const ZodQuery = <T>(schema: ZodType<T>): ParameterDecorator =>
  Query(new ZodValidationPipe(schema, 'parametres'));

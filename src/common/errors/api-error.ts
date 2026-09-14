import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorBody } from '../../contracts/index.js';

/**
 * Forme d'erreur unique de toute l'API (SPEC.md §1.3, contrat
 * `apiErrorBodySchema`) : `{ code, message, details? }`, message toujours en
 * francais et affichable tel quel par le front, qui ne le retraduit pas.
 */
export class ApiError extends HttpException {
  constructor(status: HttpStatus, body: ApiErrorBody) {
    super(body, status);
  }

  static unauthorized(
    message = 'Tu dois te connecter pour faire ca.',
  ): ApiError {
    return new ApiError(HttpStatus.UNAUTHORIZED, {
      code: 'unauthorized',
      message,
    });
  }

  static forbidden(message = "Tu n'as pas le droit de faire ca."): ApiError {
    return new ApiError(HttpStatus.FORBIDDEN, { code: 'forbidden', message });
  }

  static notFound(message = "Ca n'existe pas."): ApiError {
    return new ApiError(HttpStatus.NOT_FOUND, { code: 'not_found', message });
  }

  /** 400 : corps syntaxiquement invalide (details = issues zod). */
  static validation(message: string, details?: unknown): ApiError {
    return new ApiError(HttpStatus.BAD_REQUEST, {
      code: 'validation_error',
      message,
      details,
    });
  }

  /**
   * 422 : corps valide mais regle metier violee (SPEC.md §1.3). Meme code que
   * la validation — le front ne distingue pas les codes, seul le message
   * compte pour l'affichage.
   */
  static unprocessable(message: string, details?: unknown): ApiError {
    return new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'validation_error',
      message,
      details,
    });
  }

  /** 409 : unicite violee, ou transition incoherente avec l'etat courant. */
  static conflict(message: string): ApiError {
    return new ApiError(HttpStatus.CONFLICT, { code: 'conflict', message });
  }
}

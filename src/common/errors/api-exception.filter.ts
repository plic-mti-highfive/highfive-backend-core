import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorBody } from '../../contracts/index.js';

/**
 * Normalise toute exception vers `ApiErrorBody` : le front n'a qu'une seule
 * forme d'erreur a connaitre (`ApiError` cote client, V2-11). Les exceptions
 * Nest natives (404 de routeur, 413 du parseur...) sont traduites plutot que
 * laissees passer avec leur forme `{statusCode, message}` par defaut.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json(toBody(exception, status));
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.message : String(exception),
      exception instanceof Error ? exception.stack : undefined,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'internal_error',
      message: "Quelque chose s'est mal passe de notre cote.",
    } satisfies ApiErrorBody);
  }
}

const CODE_BY_STATUS: Record<number, string> = {
  400: 'validation_error',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'validation_error',
  422: 'validation_error',
  429: 'too_many_requests',
};

/** Nest met tantot une chaine, tantot un tableau de chaines, dans `message`. */
function toMessage(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .join(', ');
  }
  return undefined;
}

function toBody(exception: HttpException, status: number): ApiErrorBody {
  const raw = exception.getResponse();

  // Deja au bon format (leve par ApiError) : on le laisse passer tel quel.
  if (typeof raw === 'object' && raw !== null && 'code' in raw) {
    return raw as ApiErrorBody;
  }

  const nested =
    typeof raw === 'string'
      ? raw
      : ((raw as { message?: unknown }).message ?? exception.message);

  return {
    code: CODE_BY_STATUS[status] ?? 'error',
    message: toMessage(nested) ?? exception.message,
  };
}

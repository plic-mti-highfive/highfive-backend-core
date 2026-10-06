import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { RequestWithUser } from '../auth/decorators.js';

/**
 * Limitation de debit comptee par personne connectee, par IP a defaut.
 *
 * Compter par IP seule ferait partager une meme limite a tout un reseau
 * d'ecole ou d'entreprise, sorti par une seule adresse : une classe qui
 * discute depasserait vite la limite d'envoi de messages d'une personne.
 * Le garde d'authentification passe avant (ordre des `APP_GUARD`), donc
 * `request.user` est deja resolu ici, routes publiques comprises.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(
    request: Record<string, unknown>,
  ): Promise<string> {
    const user = (request as unknown as RequestWithUser).user;
    return Promise.resolve(user ? `user:${user.id}` : String(request.ip));
  }
}

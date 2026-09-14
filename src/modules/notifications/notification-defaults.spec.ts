import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_TYPES,
  defaultChannelsFor,
  defaultPreferences,
} from './notification-defaults.js';

describe('preferences par defaut (R-N4)', () => {
  it('couvre les treize types du contrat', () => {
    expect(NOTIFICATION_TYPES).toHaveLength(13);
    expect(defaultPreferences()).toHaveLength(13);
  });

  it('envoie tout dans l application', () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(defaultChannelsFor(type)).toContain('app');
    }
  });

  it('ajoute le courriel seulement pour ce qui appelle une reponse', () => {
    expect(defaultChannelsFor('invitation_received')).toContain('email');
    expect(defaultChannelsFor('join_request_received')).toContain('email');
    expect(defaultChannelsFor('message_received')).toContain('email');
    expect(defaultChannelsFor('highfive_received')).not.toContain('email');
  });
});

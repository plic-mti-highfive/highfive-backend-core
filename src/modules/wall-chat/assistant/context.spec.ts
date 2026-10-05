import { describe, expect, it } from 'vitest';
import {
  buildContext,
  estimateTokens,
  truncateHistory,
  type HistoryMessage,
} from './context.js';

const msg = (content: string) => ({ content });

describe('truncateHistory', () => {
  it('garde tout quand le budget suffit', () => {
    const { kept, dropped } = truncateHistory([msg('a'), msg('b')], 1000);
    expect(kept).toHaveLength(2);
    expect(dropped).toBe(0);
  });

  it('ecarte les plus anciens et garde les plus recents entiers, en ordre', () => {
    const messages = ['un', 'deux', 'trois', 'quatre'].map(msg);
    const budget = estimateTokens('trois') + estimateTokens('quatre');
    const { kept, dropped } = truncateHistory(messages, budget);
    expect(kept.map((m) => m.content)).toEqual(['trois', 'quatre']);
    expect(dropped).toBe(2);
  });

  it('ne coupe jamais un message : un message trop long arrete la remontee', () => {
    const messages = [msg('court'), msg('x'.repeat(4000)), msg('fin')];
    const { kept } = truncateHistory(messages, 50);
    expect(kept.map((m) => m.content)).toEqual(['fin']);
  });

  it('garde toujours le dernier message, meme au-dessus du budget', () => {
    const long = 'y'.repeat(4000);
    const { kept } = truncateHistory([msg('a'), msg(long)], 10);
    expect(kept).toEqual([msg(long)]);
  });

  it('respecte le plafond de messages', () => {
    const { kept } = truncateHistory(
      [1, 2, 3, 4].map((n) => msg(`m${n}`)),
      1000,
      2,
    );
    expect(kept.map((m) => m.content)).toEqual(['m3', 'm4']);
  });

  it('gere un historique vide', () => {
    expect(truncateHistory([], 100)).toEqual({ kept: [], dropped: 0 });
  });
});

describe('buildContext', () => {
  const history: HistoryMessage[] = [
    { authorName: 'Alice', isAssistant: false, body: 'Salut' },
    { authorName: 'Assistant IA', isAssistant: true, body: 'Bonjour !' },
    { authorName: 'Bob', isAssistant: false, body: '@ia resume' },
  ];

  it('place le prompt systeme avec le projet, puis les roles corrects', () => {
    const { turns, messageCount } = buildContext(history, {
      project: { title: 'Festival', description: 'Une fete' },
      budgetTokens: 1000,
    });
    expect(turns[0].role).toBe('system');
    expect(turns[0].content).toContain('Festival');
    expect(turns.slice(1).map((t) => t.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    expect(turns[1].content).toBe('Alice : Salut');
    expect(turns[2].content).toBe('Bonjour !');
    expect(messageCount).toBe(3);
  });

  it('deduit le prompt systeme du budget', () => {
    const { messageCount, droppedCount } = buildContext(history, {
      budgetTokens: 0,
    });
    expect(messageCount).toBe(1);
    expect(droppedCount).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import { sayDuration } from '../core/agents/agentWorld';
import { BUBBLE_LENGTH, bubbleText } from './speechBubbles';

describe('long sentences in the bubbles (A8.1)', () => {
  it('CHAR-002.c: a bubble shows the beginning of a long answer, cut at a word; the time stays bounded', () => {
    expect(bubbleText('Ciao!')).toBe('Ciao!');
    const long = 'Il salmone ricorda l’odore della sua acqua natia. '.repeat(20);
    const shown = bubbleText(long);
    expect(shown.length).toBeLessThanOrEqual(BUBBLE_LENGTH + 1);
    expect(shown.endsWith('…')).toBe(true);
    expect(long.startsWith(shown.slice(0, -1))).toBe(true);
    expect(shown.at(-2)).not.toBe(' ');
    expect(sayDuration('x'.repeat(2000))).toBe(sayDuration('x'.repeat(500)));
  });
});

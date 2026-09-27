import { describe, expect, it } from 'vitest';
import { behaviorHarness } from './testing';

const PLACES = `places:
  - { id: a, name: Punto A, at: [20, 20] }
  - { id: b, name: Punto B, at: [40, 20] }
  - { id: pozzo, name: Pozzo vecchio, at: [30, 40] }
`;

function character(id: string, at: [number, number], behavior = ''): string {
  const body = behavior.trim();
  const lines = [
    `  - id: ${id}`,
    `    name: ${id[0]!.toUpperCase()}${id.slice(1)}`,
    `    at: [${at[0]}, ${at[1]}]`,
  ];
  if (body) lines.push('    behavior:', ...body.split('\n').map((l) => `      ${l}`));
  return `${lines.join('\n')}\n`;
}

const world = (...characters: string[]) => `${PLACES}characters:\n${characters.join('')}`;

const WHERE = `repeat: false
routine:
  - ask: Dove devo andare?
    then:
      - say: Vado a {answer}!
      - walk_to: answer
    not_understood:
      - say: Non conosco quel posto.
    no_answer:
      - say: Va bene, resto qui.
  - say: fine`;

describe('questions to the player', () => {
  it('BEHAV-005.a: a question is said, then the character waits still for an answer said to it', () => {
    const h = behaviorHarness(world(character('tobia', [22, 22], WHERE)), { player: [24, 22] });
    h.run(3);
    expect(h.said('tobia')).toEqual(['Dove devo andare?']);
    expect(h.behaviors.waiting('tobia')).toBe(true);
    // Waiting, it stands still: no action after the question.
    expect(h.requests.filter((r) => r.by === 'tobia').map((r) => r.kind)).toEqual(['say']);
    expect(h.playerSays('portami al punto b', 'tobia')).toBe('tobia');
    h.until(() => h.said('tobia').includes('fine'), 30);
    expect(h.said('tobia')).toEqual(['Dove devo andare?', 'Vado a Punto B!', 'fine']);
    expect(Math.hypot(h.state('tobia').x - 40.5, h.state('tobia').z - 20.5)).toBeLessThanOrEqual(1);
  });

  it('BEHAV-005.a: without an addressee the answer goes to the nearest character that waits (Q7)', () => {
    const h = behaviorHarness(
      world(character('tobia', [22, 22], WHERE), character('marta', [30, 22], WHERE)),
      { player: [28, 22] },
    );
    h.run(3);
    expect(h.playerSays('b')).toBe('marta');
    expect(h.behaviors.waiting('marta')).toBe(false);
    expect(h.behaviors.waiting('tobia')).toBe(true);
    // Said to someone who does not wait, or too far away to hear: nobody answers.
    expect(h.playerSays('a', 'marta')).toBeUndefined();
    expect(h.behaviors.waiting('tobia')).toBe(true);
    const far = behaviorHarness(world(character('tobia', [22, 22], WHERE)), { player: [60, 60] });
    far.run(3);
    expect(far.playerSays('b', 'tobia')).toBeUndefined();
  });

  it('BEHAV-005.a, BEHAV-005.c: the time limit, 30 s by default; the branch of no answer', () => {
    const h = behaviorHarness(world(character('tobia', [22, 22], WHERE)), { player: [24, 22] });
    h.run(20);
    expect(h.said('tobia')).toEqual(['Dove devo andare?']);
    h.run(15);
    expect(h.said('tobia')).toEqual(['Dove devo andare?', 'Va bene, resto qui.', 'fine']);
    const [asked] = h.saidAt('tobia', 'Dove devo andare?');
    const [gaveUp] = h.saidAt('tobia', 'Va bene, resto qui.');
    // The waiting starts when the question is said: 1 s + 0.06 s per character.
    expect(gaveUp! - asked!).toBeCloseTo(1 + 0.06 * 'Dove devo andare?'.length + 30, 1);
    const short = behaviorHarness(
      world(
        character(
          'tobia',
          [22, 22],
          'repeat: false\nroutine:\n  - ask: Pronto?\n    timeout: 2s\n  - say: fine',
        ),
      ),
    );
    short.run(5);
    expect(short.said('tobia')).toEqual(['Pronto?', 'fine']);
  });

  it('BEHAV-005.b, BEHAV-005.c: a place, yes or no, one of the options; each answer has its branch', () => {
    const cases: [string, string, string[]][] = [
      [WHERE, 'Il pozzo vecchio', ['Vado a Pozzo vecchio!']],
      [WHERE, 'boh', ['Non conosco quel posto.']],
      [WHERE, 'a oppure b', ['Non conosco quel posto.']],
      [
        'repeat: false\nroutine:\n  - ask: Vuoi una mela?\n    expect: yes_no\n    yes: [{ say: "Ecco, {answer}" }]\n    no: [{ say: Peccato. }]\n  - say: fine',
        "Sì, d'accordo",
        ['Ecco, sì'],
      ],
      [
        'repeat: false\nroutine:\n  - ask: Vuoi una mela?\n    expect: yes_no\n    yes: [{ say: Ecco. }]\n    no: [{ say: Peccato. }]\n  - say: fine',
        'no grazie',
        ['Peccato.'],
      ],
      [
        'repeat: false\nroutine:\n  - ask: Mela o pera?\n    expect: { one_of: [mela, pera] }\n    answers:\n      mela: [{ say: Mela sia. }]\n  - say: fine',
        'la mela!',
        ['Mela sia.'],
      ],
      // Without the branch of the answer, the next instruction.
      [
        'repeat: false\nroutine:\n  - ask: Mela o pera?\n    expect: { one_of: [mela, pera] }\n    answers:\n      mela: [{ say: Mela sia. }]\n  - say: fine',
        'pera',
        [],
      ],
    ];
    for (const [behavior, answer, branch] of cases) {
      const h = behaviorHarness(world(character('tobia', [22, 22], behavior)), {
        player: [24, 22],
      });
      h.run(3);
      h.playerSays(answer, 'tobia');
      h.until(() => h.said('tobia').includes('fine'), 30);
      expect(h.said('tobia').slice(1), answer).toEqual([...branch, 'fine']);
    }
  });

  it('BEHAV-005.d: the sentence that answers a question does not start reactions', () => {
    const listener = `reactions:\n  - on: { heard: { from: player } }\n    do: [{ say: ho sentito }]`;
    const h = behaviorHarness(
      world(
        character('tobia', [22, 22], `${WHERE}\n${listener}`),
        character('marta', [26, 22], listener),
      ),
      { player: [24, 22] },
    );
    h.run(3);
    h.playerSays('b', 'tobia');
    h.run(3);
    // Tobia took it as its answer; Marta heard a sentence.
    expect(h.said('tobia')).toEqual(['Dove devo andare?', 'Vado a Punto B!']);
    expect(h.said('marta')).toEqual(['ho sentito']);
  });

  it('BEHAV-005.e: texts name the player, who spoke and the answer', () => {
    const h = behaviorHarness(
      world(
        character(
          'tobia',
          [22, 22],
          'reactions:\n  - on: interacted\n    do: [{ say: "Ciao {player}!" }]\n  - on: { heard: { from: player, mentions: any } }\n    do: [{ say: "{speaker}, hai detto {mentions}?" }]',
        ),
      ),
      { player: [23, 22] },
    );
    h.agents.interact();
    h.run(2);
    h.playerSays('conosci il pozzo vecchio?', 'tobia');
    h.run(3);
    expect(h.said('tobia')).toEqual(['Ciao viandante!', 'viandante, hai detto Pozzo vecchio?']);
  });

  it('BEHAV-004.b: in a reaction to a sentence, who spoke and what was named are destinations', () => {
    const h = behaviorHarness(
      world(
        character(
          'tobia',
          [22, 22],
          'reactions:\n  - on: { heard: { from: player, mentions: any } }\n    do:\n      - look_at: heard.from\n      - walk_to: heard.mentions\n      - say: eccomi',
        ),
      ),
      { player: [24, 22] },
    );
    h.playerSays('vai al punto b');
    h.until(() => h.said('tobia').length > 0, 30);
    const [look, walk] = h.requests.filter((r) => r.by === 'tobia');
    expect(look).toMatchObject({ kind: 'look_at', target: 'player' });
    expect(walk).toMatchObject({ kind: 'walk_to', target: 'b' });
    expect(Math.hypot(h.state('tobia').x - 40.5, h.state('tobia').z - 20.5)).toBeLessThanOrEqual(1);
  });
});

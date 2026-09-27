import { describe, expect, it } from 'vitest';
import { address, suggest } from './address';

const CHARACTERS = [
  { id: 'nina', name: 'Nina' },
  { id: 'pescatrice', name: 'Nina la pescatrice' },
  { id: 'tobia', name: 'Tobia' },
  { id: 'guardiano', name: 'Bruno' },
  { id: 'nicola', name: 'Niccolò' },
];

describe('the addressee of a message', () => {
  it('DIALOG-005.d: @ with the id or the name, case and accents ignored', () => {
    expect(address('@tobia dove vai?', CHARACTERS)).toEqual({
      ok: true,
      to: 'tobia',
      body: 'dove vai?',
    });
    expect(address('@Bruno: ciao', CHARACTERS)).toEqual({
      ok: true,
      to: 'guardiano',
      body: 'ciao',
    });
    expect(address('@GUARDIANO, ciao', CHARACTERS)).toMatchObject({
      to: 'guardiano',
      body: 'ciao',
    });
    expect(address('@niccolo come stai', CHARACTERS)).toMatchObject({ to: 'nicola' });
    expect(address('  senza destinatario ', CHARACTERS)).toEqual({
      ok: true,
      to: null,
      body: 'senza destinatario',
    });
  });

  it('DIALOG-005.d: with similar names the longest match wins; a tie prefers the id', () => {
    expect(address('@Nina la pescatrice, pesca buona?', CHARACTERS)).toMatchObject({
      to: 'pescatrice',
      body: 'pesca buona?',
    });
    expect(address('@nina la zappa dov’è?', CHARACTERS)).toMatchObject({
      to: 'nina',
      body: 'la zappa dov’è?',
    });
    const twins = [
      { id: 'anna', name: 'Bea' },
      { id: 'bea', name: 'Anna' },
    ];
    expect(address('@anna ciao', twins)).toMatchObject({ to: 'anna' });
    const same = [
      { id: 'anna1', name: 'Anna' },
      { id: 'anna2', name: 'Anna' },
    ];
    expect(address('@Anna ciao', same)).toEqual({
      ok: false,
      error: '"Anna" may be Anna (anna1), Anna (anna2): write the id',
    });
  });

  it('DIALOG-005.d: an @ that matches no character is refused with the names available', () => {
    const error = `the characters are: Nina (nina), Nina la pescatrice (pescatrice), Tobia (tobia), Bruno (guardiano), Niccolò (nicola)`;
    expect(address('@nessuno ciao', CHARACTERS)).toEqual({
      ok: false,
      error: `no character is called "nessuno"; ${error}`,
    });
    expect(address('@tobiaciao', CHARACTERS)).toMatchObject({ ok: false });
    expect(address('@tobia ciao', [])).toEqual({
      ok: false,
      error: 'no character is called "tobia"; there are no characters in this world',
    });
    expect(address('@ tobia ciao', CHARACTERS)).toMatchObject({ ok: false });
  });

  it('DIALOG-005.d: the suggestions are the characters whose id or name starts with what is written', () => {
    const ids = (written: string) => suggest(written, CHARACTERS).map((c) => c.id);
    expect(ids('')).toEqual(['guardiano', 'nicola', 'nina', 'pescatrice', 'tobia']);
    expect(ids('ni')).toEqual(['nicola', 'nina', 'pescatrice']);
    expect(ids('Nina l')).toEqual(['pescatrice']);
    expect(ids('pesc')).toEqual(['pescatrice']);
    expect(ids('gu')).toEqual(['guardiano']);
    expect(ids('x')).toEqual([]);
  });
});

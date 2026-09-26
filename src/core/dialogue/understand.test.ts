import { describe, expect, it } from 'vitest';
import {
  mentions,
  understandChoice,
  understandElement,
  understandYesNo,
  words,
} from './understand';

const MAP = [
  { id: 'laghetto1', name: 'Laghetto del mulino' },
  { id: 'casa', name: 'Casa' },
  { id: 'casa_fabbro', name: 'Casa del fabbro' },
  { id: 'pond#1', name: 'Stagno' },
  { id: 'citta', name: 'Città vecchia' },
  { id: 'tobia', name: 'Tobia' },
];

describe('understanding sentences', () => {
  it('DIALOG-003.a: ids and names as whole words, ignoring case, accents and punctuation', () => {
    expect(words('Portami al Laghetto del MULINO, per favore!')).toEqual([
      'portami',
      'al',
      'laghetto',
      'del',
      'mulino',
      'per',
      'favore',
    ]);
    expect(words('vai a pond#1 e casa_fabbro.')).toEqual([
      'vai',
      'a',
      'pond#1',
      'e',
      'casa_fabbro',
    ]);
    for (const [text, named] of [
      ['laghetto1', ['laghetto1']],
      ['Portami al laghetto del mulino', ['laghetto1']],
      ['Andiamo in CITTA VECCHIA', ['citta']],
      ['andiamo in città vecchia', ['citta']],
      ['vai allo stagno!', ['pond#1']],
      ['pond#1', ['pond#1']],
      // Whole words only: «casale» is not «casa», «laghetto10» is not «laghetto1».
      ['il casale', []],
      ['laghetto10', []],
      ['cerca Tobia', ['tobia']],
    ] as const) {
      expect(mentions(text, MAP), text).toEqual(named);
    }
  });

  it('DIALOG-003.a: a match inside a longer one does not count', () => {
    expect(mentions('vai alla casa del fabbro', MAP)).toEqual(['casa_fabbro']);
    expect(mentions('vai alla casa', MAP)).toEqual(['casa']);
    expect(mentions('dalla casa del fabbro alla casa', MAP)).toEqual(['casa', 'casa_fabbro']);
  });

  it('DIALOG-003.b: an answer is understood when it names exactly one element', () => {
    expect(understandElement('laghetto1', MAP)).toBe('laghetto1');
    expect(understandElement('portami alla Casa del fabbro', MAP)).toBe('casa_fabbro');
    expect(understandElement('non lo so', MAP)).toBeUndefined();
    expect(understandElement('il laghetto1 o la casa?', MAP)).toBeUndefined();
    // Two elements with the same name: ambiguous.
    const twins = [
      { id: 'a', name: 'Pozzo' },
      { id: 'b', name: 'Pozzo' },
    ];
    expect(understandElement('al pozzo', twins)).toBeUndefined();
  });

  it('DIALOG-003.c: yes and no in Italian and English, not both; one of the options', () => {
    for (const [text, answer] of [
      ['Sì', 'yes'],
      ['si, certo!', 'yes'],
      ["D'accordo", 'yes'],
      ['va bene', 'yes'],
      ['yes please', 'yes'],
      ['No grazie', 'no'],
      ['nope', 'no'],
      ['sì e no', undefined],
      ['non lo so', undefined],
      ['forse', undefined],
    ] as const) {
      expect(understandYesNo(text), text).toBe(answer);
    }
    const options = ['la mela', 'la pera', 'mela cotogna'];
    expect(understandChoice('vorrei la pera', options)).toBe('la pera');
    expect(understandChoice('La Mela!', options)).toBe('la mela');
    expect(understandChoice('una mela cotogna', options)).toBe('mela cotogna');
    expect(understandChoice('la pera e la mela', options)).toBeUndefined();
    expect(understandChoice('niente', options)).toBeUndefined();
  });

  it('DIALOG-003.d: the same sentence and map always give the same interpretation', () => {
    const shuffled = [...MAP].reverse();
    for (const text of ['vai alla casa del fabbro', 'laghetto1', 'la casa e lo stagno']) {
      expect(mentions(text, shuffled)).toEqual(mentions(text, MAP));
      expect(mentions(text, MAP)).toEqual(mentions(text, MAP));
    }
  });
});

import { describe, expect, it } from 'vitest';
import { markdownToText, parseInline, parseMarkdown } from './markdown';

describe('Markdown of the console messages (A7.4)', () => {
  it('DIALOG-005.a: bold, italics, code and links inside the text; ids with _ and # stay text', () => {
    expect(parseInline('**Vado** a *casa* con `walk_to` e _calma_')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'Vado' }] },
      { kind: 'text', text: ' a ' },
      { kind: 'em', children: [{ kind: 'text', text: 'casa' }] },
      { kind: 'text', text: ' con ' },
      { kind: 'code', text: 'walk_to' },
      { kind: 'text', text: ' e ' },
      { kind: 'em', children: [{ kind: 'text', text: 'calma' }] },
    ]);
    expect(parseInline('vai a casa_del_fabbro o scatter#5, 2 * 3 * 4')).toEqual([
      { kind: 'text', text: 'vai a casa_del_fabbro o scatter#5, 2 * 3 * 4' },
    ]);
    expect(parseInline('[mappa](https://example.org/m) e [x](javascript:alert(1))')).toEqual([
      { kind: 'link', href: 'https://example.org/m', children: [{ kind: 'text', text: 'mappa' }] },
      { kind: 'text', text: ' e [x](javascript:alert(1))' },
    ]);
    expect(parseInline('<b>no</b>')).toEqual([{ kind: 'text', text: '<b>no</b>' }]);
  });

  it('DIALOG-005.a: paragraphs with line breaks, headings, lists and code blocks', () => {
    expect(
      parseMarkdown('# Giro\nprima riga\nseconda\n\n- uno\n- due\n1. a\n2. b\n```\nx = 1\n```'),
    ).toEqual([
      { kind: 'heading', level: 1, children: [{ kind: 'text', text: 'Giro' }] },
      {
        kind: 'paragraph',
        children: [
          { kind: 'text', text: 'prima riga' },
          { kind: 'break' },
          { kind: 'text', text: 'seconda' },
        ],
      },
      {
        kind: 'list',
        ordered: false,
        items: [[{ kind: 'text', text: 'uno' }], [{ kind: 'text', text: 'due' }]],
      },
      {
        kind: 'list',
        ordered: true,
        items: [[{ kind: 'text', text: 'a' }], [{ kind: 'text', text: 'b' }]],
      },
      { kind: 'code', text: 'x = 1' },
    ]);
    expect(markdownToText('**Titolo**\n- `uno` e [due](https://d.it)\n1. tre')).toEqual([
      'Titolo',
      '- uno e due (https://d.it)',
      '1. tre',
    ]);
  });
});

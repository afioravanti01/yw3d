/**
 * A small Markdown for the messages of the console (A7.4): paragraphs with their line breaks,
 * headings, lists, code blocks, and inside the text bold, italics, code and links. It gives a
 * tree, never HTML: the views build their nodes from it, the terminal prints its text, so a
 * message can never inject markup.
 */

export type Inline =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'strong'; readonly children: readonly Inline[] }
  | { readonly kind: 'em'; readonly children: readonly Inline[] }
  | { readonly kind: 'link'; readonly href: string; readonly children: readonly Inline[] }
  | { readonly kind: 'break' };

export type Block =
  | { readonly kind: 'paragraph'; readonly children: readonly Inline[] }
  | { readonly kind: 'heading'; readonly level: 1 | 2 | 3; readonly children: readonly Inline[] }
  | {
      readonly kind: 'list';
      readonly ordered: boolean;
      readonly items: readonly (readonly Inline[])[];
    }
  | { readonly kind: 'code'; readonly text: string };

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const FENCE = /^\s*```/;

export function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const endParagraph = () => {
    if (paragraph.length === 0) return;
    const children: Inline[] = [];
    paragraph.forEach((line, i) => {
      if (i > 0) children.push({ kind: 'break' });
      children.push(...parseInline(line));
    });
    blocks.push({ kind: 'paragraph', children });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (FENCE.test(line)) {
      endParagraph();
      const code: string[] = [];
      for (i++; i < lines.length && !FENCE.test(lines[i]!); i++) code.push(lines[i]!);
      blocks.push({ kind: 'code', text: code.join('\n') });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      endParagraph();
      const level = heading[1]!.length as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, children: parseInline(heading[2]!) });
      continue;
    }
    const item = BULLET.exec(line) ?? NUMBERED.exec(line);
    if (item) {
      endParagraph();
      const ordered = !BULLET.test(line);
      const last = blocks.at(-1);
      if (last?.kind === 'list' && last.ordered === ordered) {
        (last.items as Inline[][]).push(parseInline(item[1]!));
      } else {
        blocks.push({ kind: 'list', ordered, items: [parseInline(item[1]!)] });
      }
      continue;
    }
    if (line.trim() === '') endParagraph();
    else paragraph.push(line);
  }
  endParagraph();
  return blocks;
}

/** Inline patterns, tried at every position; the earliest match wins. */
const PATTERNS: readonly {
  readonly re: RegExp;
  readonly make: (m: RegExpExecArray) => Inline;
}[] = [
  { re: /`([^`]+)`/y, make: (m) => ({ kind: 'code', text: m[1]! }) },
  { re: /\*\*(?=\S)(.+?)(?<=\S)\*\*/y, make: (m) => strong(m[1]!) },
  { re: /__(?=\S)(.+?)(?<=\S)__(?!\w)/y, make: (m) => strong(m[1]!) },
  { re: /\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?!\*)/y, make: (m) => em(m[1]!) },
  { re: /_(?=[^\s_])(.+?)(?<=[^\s_])_(?!\w)/y, make: (m) => em(m[1]!) },
  {
    re: /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/y,
    make: (m) => ({ kind: 'link', href: m[2]!, children: parseInline(m[1]!) }),
  },
];

const strong = (text: string): Inline => ({ kind: 'strong', children: parseInline(text) });
const em = (text: string): Inline => ({ kind: 'em', children: parseInline(text) });

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let plain = '';
  let i = 0;
  while (i < text.length) {
    // `_` inside a word (an id such as casa_fabbro) is not italics.
    const inWord = i > 0 && /[\p{L}\p{N}]/u.test(text[i - 1]!);
    let found: { inline: Inline; length: number } | undefined;
    for (const { re, make } of PATTERNS) {
      if (inWord && text[i] === '_') break;
      re.lastIndex = i;
      const m = re.exec(text);
      if (m) {
        found = { inline: make(m), length: m[0].length };
        break;
      }
    }
    if (found) {
      if (plain) out.push({ kind: 'text', text: plain });
      plain = '';
      out.push(found.inline);
      i += found.length;
    } else {
      plain += text[i];
      i++;
    }
  }
  if (plain) out.push({ kind: 'text', text: plain });
  return out;
}

/** The text of inline elements, without their marks. */
export function inlineText(inlines: readonly Inline[]): string {
  return inlines
    .map((i) =>
      i.kind === 'text' || i.kind === 'code'
        ? i.text
        : i.kind === 'break'
          ? '\n'
          : i.kind === 'link'
            ? `${inlineText(i.children)} (${i.href})`
            : inlineText(i.children),
    )
    .join('');
}

/** Markdown as plain lines, for the terminal of the host. */
export function markdownToText(text: string): string[] {
  return parseMarkdown(text).flatMap((b): string[] => {
    switch (b.kind) {
      case 'paragraph':
      case 'heading':
        return inlineText(b.children).split('\n');
      case 'list':
        return b.items.map((item, n) => `${b.ordered ? `${n + 1}.` : '-'} ${inlineText(item)}`);
      case 'code':
        return b.text.split('\n');
    }
  });
}

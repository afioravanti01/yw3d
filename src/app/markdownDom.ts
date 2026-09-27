import type { Block, Inline } from '../core/dialogue/markdown';

/**
 * DOM nodes of a Markdown tree (A7.4). Every text goes in as a text node and links take only
 * the `http` and `https` addresses the parser accepts, so a message cannot inject markup.
 */
export function blocksToDom(blocks: readonly Block[]): Node[] {
  return blocks.map((block) => {
    switch (block.kind) {
      case 'paragraph':
        return element('p', inlinesToDom(block.children));
      case 'heading':
        return element(`h${block.level + 2}`, inlinesToDom(block.children));
      case 'list':
        return element(
          block.ordered ? 'ol' : 'ul',
          block.items.map((item) => element('li', inlinesToDom(item))),
        );
      case 'code':
        return element('pre', [element('code', [document.createTextNode(block.text)])]);
    }
  });
}

export function inlinesToDom(inlines: readonly Inline[]): Node[] {
  return inlines.map((inline) => {
    switch (inline.kind) {
      case 'text':
        return document.createTextNode(inline.text);
      case 'code':
        return element('code', [document.createTextNode(inline.text)]);
      case 'strong':
        return element('strong', inlinesToDom(inline.children));
      case 'em':
        return element('em', inlinesToDom(inline.children));
      case 'break':
        return document.createElement('br');
      case 'link': {
        const a = element('a', inlinesToDom(inline.children)) as HTMLAnchorElement;
        a.href = inline.href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        return a;
      }
    }
  });
}

function element(tag: string, children: readonly Node[]): HTMLElement {
  const node = document.createElement(tag);
  node.append(...children);
  return node;
}

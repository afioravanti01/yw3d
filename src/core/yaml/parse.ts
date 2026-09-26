import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Node } from 'yaml';
import type { Path } from '../schema/schema';
import { diagnostic, type Diagnostic } from './report';

export interface ParsedYaml {
  /** Plain JavaScript value of the document; undefined if the syntax is invalid. */
  readonly value: unknown;
  /** Syntax errors, with their line. */
  readonly diagnostics: Diagnostic[];
  /**
   * 1-based line of a field: the line of its key in a mapping, of the item in a list. For a
   * missing field, the line of its closest existing ancestor.
   */
  lineOf(path: Path): number | null;
}

/** Parses YAML text keeping the position of every node (plan F02 P1). */
export function parseYaml(text: string, file: string): ParsedYaml {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, prettyErrors: false });
  const line = (offset: number) => lineCounter.linePos(offset).line;

  const lineOf = (path: Path): number | null => {
    let node: unknown = doc.contents;
    let found: number | null = node && (node as Node).range ? line((node as Node).range![0]) : 1;
    for (const segment of path) {
      if (isMap(node)) {
        const pair = node.items.find((p) => isScalar(p.key) && String(p.key.value) === segment);
        if (!pair) break;
        if (isScalar(pair.key) && pair.key.range) found = line(pair.key.range[0]);
        node = pair.value;
      } else if (isSeq(node) && typeof segment === 'number') {
        const item = node.items[segment] as Node | undefined;
        if (!item) break;
        if (item.range) found = line(item.range[0]);
        node = item;
      } else {
        break;
      }
    }
    return found;
  };

  const diagnostics = doc.errors.map((error) =>
    diagnostic('error', file, line(error.pos[0]), '', `invalid YAML: ${firstLine(error.message)}`),
  );
  const value = diagnostics.length > 0 ? undefined : doc.toJS();
  return { value, diagnostics, lineOf };
}

function firstLine(message: string): string {
  return message.split('\n')[0]!;
}

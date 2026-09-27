/**
 * World file validation from the command line (YAML-002.e).
 *
 * Usage: npm run world:check -- worlds/default.yaml [more files…]
 *
 * Composes each world with the built-in structures, prints errors and warnings in the same
 * format as the app panel, and exits with a non-zero code if any file has errors.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { composeWorld } from '../src/core/compose/composeWorld';
import { createDefaultStructures } from '../src/core/structures/builtin';
import { formatDiagnostic, hasErrors } from '../src/core/yaml/report';

export function checkWorlds(
  files: readonly string[],
  read: (file: string) => string,
  print: (line: string) => void,
): number {
  if (files.length === 0) {
    print('Usage: npm run world:check -- <file.yaml> [more files…]');
    return 2;
  }
  const registry = createDefaultStructures();
  let failed = false;
  for (const file of files) {
    let text: string;
    try {
      text = read(file);
    } catch (error) {
      print(`${file}  error  cannot read the file: ${(error as Error).message}`);
      failed = true;
      continue;
    }
    // Files the world names (behaviors) are next to it, in its folder (BEHAV-001.a).
    const folder = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
    const result = composeWorld(text, file, {
      registry,
      readFile: (relative) => {
        try {
          return read(`${folder}${relative}`);
        } catch {
          return undefined;
        }
      },
    });
    for (const d of result.diagnostics) print(formatDiagnostic(d));
    if (hasErrors(result.diagnostics)) {
      failed = true;
    } else {
      const total = Object.values(result.structureCounts).reduce((a, b) => a + b, 0);
      const warnings = result.diagnostics.length;
      print(`${file}: ok, ${total} structures, ${warnings} warning${warnings === 1 ? '' : 's'}`);
    }
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = checkWorlds(
    process.argv.slice(2),
    (file) => readFileSync(file, 'utf8'),
    (line) => console.log(line),
  );
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

async function lintCoreSource(source: string): Promise<(string | null)[]> {
  const eslint = new ESLint({ cwd: root });
  const [result] = await eslint.lintText(source, {
    filePath: path.join(root, 'src/core/__fixture__.ts'),
  });
  return result!.messages.map((m) => m.ruleId);
}

/** Typechecks an in-memory file placed in src/core with the core's compiler options. */
function typecheckCoreSource(source: string): string[] {
  const { config } = ts.readConfigFile(path.join(root, 'tsconfig.core.json'), ts.sys.readFile);
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, root);
  const fileName = path.join(root, 'src/core/__fixture__.ts');
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, ...rest) =>
    path.resolve(name) === fileName
      ? ts.createSourceFile(name, source, languageVersion)
      : getSourceFile(name, languageVersion, ...rest);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (name) => path.resolve(name) === fileName || fileExists(name);
  const program = ts.createProgram([fileName], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

describe('core boundary', () => {
  it('ARCH-001.a: importing three from src/core fails lint', async () => {
    expect(
      await lintCoreSource("import * as THREE from 'three';\nexport const t = THREE;\n"),
    ).toContain('no-restricted-imports');
    expect(await lintCoreSource('export const x = 1;\n')).toEqual([]);
  });

  it('ARCH-001.a: using DOM APIs in src/core fails typecheck', () => {
    const errors = typecheckCoreSource('export const w = window.innerWidth;\n');
    expect(errors.some((m) => m.includes("Cannot find name 'window'"))).toBe(true);
    expect(typecheckCoreSource('export const x: number = 1;\n')).toEqual([]);
  });

  it('ARCH-001.b: unit tests run in Node without a DOM', () => {
    expect('window' in globalThis).toBe(false);
    expect('document' in globalThis).toBe(false);
    expect(typeof process.versions.node).toBe('string');
  });
});

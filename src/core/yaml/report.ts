import { formatPath, type Path } from '../schema/schema';

export type Severity = 'error' | 'warning';

/**
 * A problem found in a world file (plan F02 P14): the same shape for the app panel and for the
 * command line, so that both show file, line, field path and cause (YAML-002.a).
 */
export interface Diagnostic {
  readonly severity: Severity;
  readonly file: string;
  /** 1-based line, or null when the problem has no position (e.g. an empty file). */
  readonly line: number | null;
  /** Field path such as `structures[3].params.width`; empty for the whole file. */
  readonly path: string;
  readonly message: string;
}

export function diagnostic(
  severity: Severity,
  file: string,
  line: number | null,
  path: Path | string,
  message: string,
): Diagnostic {
  return {
    severity,
    file,
    line,
    path: typeof path === 'string' ? path : formatPath(path),
    message,
  };
}

/** `worlds/default.yaml:12  error  structures[0].params.widht  unknown field` */
export function formatDiagnostic(d: Diagnostic): string {
  const where = d.line === null ? d.file : `${d.file}:${d.line}`;
  return [where, d.severity, d.path, d.message].filter((part) => part !== '').join('  ');
}

export const hasErrors = (diagnostics: readonly Diagnostic[]) =>
  diagnostics.some((d) => d.severity === 'error');

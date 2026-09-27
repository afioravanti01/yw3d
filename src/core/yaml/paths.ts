/**
 * A path relative to the world folder, normalized with `/`, or undefined when it leaves the
 * folder (an absolute path, a drive, or `..` above the folder). Programs must stay inside the
 * world folder (PY-003.b).
 */
export function insideFolder(relative: string): string | undefined {
  const normalized = relative.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) return undefined;
  const parts: string[] = [];
  for (const part of normalized.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return undefined;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.length === 0 ? undefined : parts.join('/');
}

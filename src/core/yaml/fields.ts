import { pattern, optional, text } from '../schema/schema';

/** Longest name and description (YAML-009.a, F06 Q8). */
export const MAX_NAME_LENGTH = 60;
export const MAX_DESCRIPTION_LENGTH = 1000;

/**
 * Identifiers of characters, places, structures and distributions (MAP-001.a). `#` is not
 * allowed: it marks the identifiers generated for structures without one (MAP-001.b).
 */
export const IDENTIFIER = /^[a-z][a-z0-9_-]{0,31}$/;
export const identifier = () =>
  pattern(IDENTIFIER, 'an identifier of lowercase letters, digits, "_" or "-"');
export const name = () => text({ min: 1, max: MAX_NAME_LENGTH });
export const description = () => optional(text({ max: MAX_DESCRIPTION_LENGTH }));

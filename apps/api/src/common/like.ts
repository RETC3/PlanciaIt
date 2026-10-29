/** Escapes LIKE wildcards so a search for "100%" matches literally. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** ILIKE pattern matching `text` anywhere. */
export function containsPattern(text: string): string {
  return `%${escapeLike(text)}%`;
}

/** ILIKE pattern matching values that start with `text`. */
export function prefixPattern(text: string): string {
  return `${escapeLike(text)}%`;
}

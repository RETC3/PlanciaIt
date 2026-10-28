import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS_FOLDER } from './migrate.js';

interface Journal {
  entries: { idx: number; tag: string }[];
}

describe('migrations folder', () => {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8'),
  ) as Journal;

  it('has at least the initial migration', () => {
    expect(journal.entries[0]?.tag).toBe('0000_init');
  });

  it('has a SQL file for every journal entry', () => {
    for (const entry of journal.entries) {
      expect(existsSync(join(MIGRATIONS_FOLDER, `${entry.tag}.sql`))).toBe(true);
    }
  });
});

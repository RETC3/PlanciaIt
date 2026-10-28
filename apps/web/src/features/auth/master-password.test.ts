import { MASTER_PASSWORD_MIN_LENGTH } from '@planciait/shared';
import { describe, expect, it } from 'vitest';
import { masterPasswordError } from './master-password';

describe('masterPasswordError', () => {
  const valid = 'x'.repeat(MASTER_PASSWORD_MIN_LENGTH);

  it('accepts a long enough, confirmed password', () => {
    expect(masterPasswordError(valid, valid)).toBeNull();
  });

  it('rejects a short password before checking the confirmation', () => {
    expect(masterPasswordError('short', 'other')).toBe('tooShort');
  });

  it('rejects a mismatched confirmation', () => {
    expect(masterPasswordError(valid, `${valid}!`)).toBe('mismatch');
  });
});

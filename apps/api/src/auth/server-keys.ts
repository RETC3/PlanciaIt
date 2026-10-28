import type { Provider } from '@nestjs/common';
import { deriveSubkey, fromBase64 } from '@planciait/crypto';
import { APP_CONFIG, type AppConfig } from '../config/config.js';

/** Purpose-specific keys derived once from SECRET_KEY at startup. */
export interface ServerKeys {
  /** Encrypts TOTP secrets at rest. */
  totpEncryption: Uint8Array;
  /** Produces stable fake KDF salts for unknown usernames. */
  fakeSalt: Uint8Array;
}

export const SERVER_KEYS = Symbol('SERVER_KEYS');

export const serverKeysProvider: Provider = {
  provide: SERVER_KEYS,
  inject: [APP_CONFIG],
  useFactory: async (config: AppConfig): Promise<ServerKeys> => {
    const secretKey = await fromBase64(config.secretKey);
    return {
      totpEncryption: await deriveSubkey(secretKey, 'totp-encryption'),
      fakeSalt: await deriveSubkey(secretKey, 'fake-kdf-salt'),
    };
  },
};

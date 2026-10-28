import sodium from 'libsodium-wrappers-sumo';

export type Sodium = typeof sodium;

/** Every helper awaits this: libsodium's WebAssembly module loads asynchronously. */
export async function getSodium(): Promise<Sodium> {
  await sodium.ready;
  return sodium;
}

/** Binary values cross the wire and the database as unpadded base64url. */
export async function toBase64(bytes: Uint8Array): Promise<string> {
  const s = await getSodium();
  return s.to_base64(bytes, s.base64_variants.URLSAFE_NO_PADDING);
}

export async function fromBase64(value: string): Promise<Uint8Array> {
  const s = await getSodium();
  return s.from_base64(value, s.base64_variants.URLSAFE_NO_PADDING);
}

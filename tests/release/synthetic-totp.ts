import { createHmac } from "node:crypto";

/** Only for disposable local fixture identities, never a customer factor. */
export const SYNTHETIC_MASTER_TOTP = "JBSWY3DPEHPK3PXP";

export function syntheticTotp(secret = SYNTHETIC_MASTER_TOTP) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret].map((letter) => alphabet.indexOf(letter).toString(2).padStart(5, "0")).join("");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hash = createHmac("sha1", key).update(counter).digest();
  return String((hash.readUInt32BE(hash[hash.length - 1]! & 15) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
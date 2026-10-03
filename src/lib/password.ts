/*
 * Password hashing with Node.js scrypt (no extra dependencies).
 * Stored format: scrypt$N$r$p$saltHex$hashHex
 * Verification uses timingSafeEqual to avoid timing attacks.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

// OWASP-aligned parameters: N=16384, r=8, p=1, 64-byte key
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

type ScryptOptions = { N: number; r: number; p: number; maxmem?: number };

function scryptBuf(password: string, salt: string, options?: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, KEYLEN, options ?? { N, r: R, p: P }, (err, derived) => {
      if (err) reject(err);
      else resolve(derived as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  const salt = randomBytes(16).toString("hex");
  const hash = await scryptBuf(password, salt);
  return `scrypt$${N}$${R}$${P}$${salt}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, n, r, p, salt, hashHex] = parts;
    const hash = await scryptBuf(password, salt, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    const expected = Buffer.from(hashHex, "hex");
    if (expected.length !== hash.length) return false;
    return timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}

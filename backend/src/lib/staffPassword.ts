import { randomBytes, scryptSync } from 'crypto';

const KEYLEN = 64;

export function hashStaffPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEYLEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

import crypto from 'crypto';

const TOKEN_BYTES = 32;
const EXPIRES_DAYS = 7;

export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

export function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function getInviteExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + EXPIRES_DAYS);
  return d;
}

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const sc = promisify(scrypt) as (p: string, s: Buffer, n: number) => Promise<Buffer>;

export async function hashPw(pw: string) {
  const s = randomBytes(16);
  return `${s.toString('hex')}:${(await sc(pw, s, 64)).toString('hex')}`;
}

export async function checkPw(pw: string, stored: string) {
  const [s, h] = stored.split(':');
  return timingSafeEqual(await sc(pw, Buffer.from(s, 'hex'), 64), Buffer.from(h, 'hex'));
}

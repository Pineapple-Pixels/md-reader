import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;

describe('password hashing', () => {
  it('hashes password and verifies correctly', async () => {
    const plain = 'mySecurePass123';
    const hash = await bcrypt.hash(plain, BCRYPT_COST);
    expect(hash).not.toBe(plain);
    expect(hash.startsWith('$2a$12$') || hash.startsWith('$2b$12$')).toBe(true);
    expect(await bcrypt.compare(plain, hash)).toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await bcrypt.hash('correct', BCRYPT_COST);
    expect(await bcrypt.compare('wrong', hash)).toBe(false);
  });

  it('produces different hashes for same input (salted)', async () => {
    const plain = 'samePassword';
    const hash1 = await bcrypt.hash(plain, BCRYPT_COST);
    const hash2 = await bcrypt.hash(plain, BCRYPT_COST);
    expect(hash1).not.toBe(hash2);
    // Both still verify
    expect(await bcrypt.compare(plain, hash1)).toBe(true);
    expect(await bcrypt.compare(plain, hash2)).toBe(true);
  });
});

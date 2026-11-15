import { describe, it, expect } from 'vitest';
import { CreateUserBody } from '../src/routes/admin-api.js';

describe('CreateUserBody', () => {
  it('should accept an invite made of only an email', () => {
    expect(CreateUserBody.safeParse({ email: 'Ana@Gmail.com', role: 'member' }).success).toBe(true);
  });

  it('should accept a local account made of username and password', () => {
    expect(CreateUserBody.safeParse({ username: 'ana', password: 'secreto1' }).success).toBe(true);
  });

  it('should reject a local account that also carries an email', () => {
    expect(CreateUserBody.safeParse({ username: 'ana', password: 'secreto1', email: 'ana@gmail.com' }).success).toBe(false);
  });

  it('should reject incomplete or unknown fields', () => {
    expect(CreateUserBody.safeParse({ username: 'ana' }).success).toBe(false);
    expect(CreateUserBody.safeParse({ email: 'ana@gmail.com', password: 'secreto1' }).success).toBe(false);
    expect(CreateUserBody.safeParse({ email: 'ana@gmail.com', googleSub: 'x' }).success).toBe(false);
  });
});

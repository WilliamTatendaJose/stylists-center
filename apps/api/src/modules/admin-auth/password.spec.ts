import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('admin password hashing', () => {
  it('verifies the correct password against its own hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });

  it('salts each hash differently, even for the same password', async () => {
    const a = await hashPassword('same password');
    const b = await hashPassword('same password');
    expect(a).not.toBe(b);
  });

  it('never crashes on a malformed stored hash', async () => {
    await expect(verifyPassword('anything', 'not-a-valid-hash')).resolves.toBe(false);
    await expect(verifyPassword('anything', '')).resolves.toBe(false);
  });
});

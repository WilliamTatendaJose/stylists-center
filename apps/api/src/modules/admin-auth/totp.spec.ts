import { describe, expect, it } from 'vitest';
import { deriveKey, open, seal } from './secret-box';
import { base32Decode, base32Encode, otpauthUrl, totpCode, totpStep, verifyTotp } from './totp';

// RFC 6238 Appendix B: the SHA-1 seed is the ASCII string "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('TOTP', () => {
  it('matches the RFC 6238 SHA-1 test vectors (8 digits)', () => {
    const vectors: [number, string][] = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
      [20000000000, '65353130'],
    ];
    for (const [seconds, expected] of vectors) {
      expect(totpCode(RFC_SECRET, totpStep(seconds * 1000), 8)).toBe(expected);
    }
  });

  it('round-trips base32', () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it('accepts the current code and one step of drift either side, nothing further', () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    for (const offset of [-1, 0, 1]) {
      expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + offset), now, null)).toBe(
        step + offset,
      );
    }
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 2), now, null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), now, null)).toBeNull();
  });

  it('refuses a replayed code and malformed input', () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    const code = totpCode(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, code, now, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, '12345', now, null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef', now, null)).toBeNull();
  });

  it('builds an otpauth URL authenticator apps accept', () => {
    const url = new URL(otpauthUrl('JBSWY3DPEHPK3PXP', 'owner@example.com'));
    expect(url.protocol).toBe('otpauth:');
    expect(url.host).toBe('totp');
    expect(decodeURIComponent(url.pathname)).toBe('/Stylists Center:owner@example.com');
    expect(url.searchParams.get('secret')).toBe('JBSWY3DPEHPK3PXP');
    expect(url.searchParams.get('issuer')).toBe('Stylists Center');
  });
});

describe('secret-box', () => {
  const key = deriveKey('a-pepper-of-at-least-32-characters-long');

  it('round-trips and never repeats ciphertext', () => {
    const a = seal('JBSWY3DPEHPK3PXP', key);
    const b = seal('JBSWY3DPEHPK3PXP', key);
    expect(a).not.toBe(b);
    expect(open(a, key)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('rejects tampering and the wrong key', () => {
    const sealed = seal('secret', key);
    const parts = sealed.split('.');
    const tampered = [parts[0], parts[1], parts[2], `A${(parts[3] ?? '').slice(1)}`].join('.');
    expect(() => open(tampered, key)).toThrow();
    expect(() => open(sealed, deriveKey('a-different-pepper-of-32-characters!!'))).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { deriveInitials, deriveTint } from './avatar.js';

describe('deriveInitials', () => {
  it('takes the first letter of the first two words', () => {
    expect(deriveInitials('Tariro Moyo')).toBe('TM');
    expect(deriveInitials('  Chiedza   Banda ')).toBe('CB');
  });

  it('falls back to the first two letters of a single word', () => {
    expect(deriveInitials('Prince')).toBe('PR');
  });

  it('never returns empty, even for blank input', () => {
    expect(deriveInitials('')).toBe('?');
    expect(deriveInitials('   ')).toBe('?');
  });
});

describe('deriveTint', () => {
  it('is deterministic — the same name always gets the same tint', () => {
    expect(deriveTint('Tariro Moyo')).toBe(deriveTint('Tariro Moyo'));
  });

  it('returns a hex colour', () => {
    expect(deriveTint('Tariro Moyo')).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

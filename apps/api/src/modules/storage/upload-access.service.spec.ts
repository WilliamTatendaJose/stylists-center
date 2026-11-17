import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { UploadAccessService, stripUploadSignature } from './upload-access.service';

const config = new ConfigService<Env, true>({
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://sc:sc@localhost:5433/sc_test',
  JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
} as Env);

const newName = () => `${randomUUID()}.jpg`;

describe('UploadAccessService', () => {
  let prisma: PrismaService;
  let access: UploadAccessService;
  const names: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService(config);
    await prisma.onModuleInit();
    access = new UploadAccessService(prisma, config);
  });

  afterAll(async () => {
    await prisma.upload.deleteMany({ where: { name: { in: names } } });
    await prisma.onModuleDestroy();
  });

  it('signs only API-owned upload URLs, and verifies its own signature until it expires', () => {
    const name = newName();
    const now = Date.UTC(2026, 10, 17, 9, 30);
    const signed = access.sign(`/uploads/${name}`, 3600, now);
    const query = new URL(signed, 'https://api.example').searchParams;
    expect(access.verify(name, query.get('exp'), query.get('sig'), now)).toBe(true);
    // Another object, a tampered expiry, or after expiry: refused.
    expect(access.verify(newName(), query.get('exp'), query.get('sig'), now)).toBe(false);
    expect(
      access.verify(name, String(Number(query.get('exp')) + 3600), query.get('sig'), now),
    ).toBe(false);
    expect(access.verify(name, query.get('exp'), query.get('sig'), now + 3 * 3600_000)).toBe(false);
    expect(access.verify(name, undefined, undefined, now)).toBe(false);

    expect(access.sign('https://cdn.example/photo.jpg', 3600)).toBe(
      'https://cdn.example/photo.jpg',
    );
    expect(access.sign(null, 3600)).toBeNull();
  });

  it('gives the same link for a while, so clients can cache it', () => {
    const now = Date.UTC(2026, 10, 17, 9, 0, 5);
    const name = newName();
    expect(access.sign(`/uploads/${name}`, 3600, now)).toBe(
      access.sign(`/uploads/${name}`, 3600, now + 20 * 60_000),
    );
  });

  it('strips a signature back to the stored URL, and leaves anything else alone', () => {
    const name = newName();
    expect(stripUploadSignature(access.sign(`/uploads/${name}`, 3600))).toBe(`/uploads/${name}`);
    expect(stripUploadSignature('https://cdn.example/a.jpg?x=1')).toBe(
      'https://cdn.example/a.jpg?x=1',
    );
  });

  it("makes only the caller's own uploads private", async () => {
    const mine = newName();
    const theirs = newName();
    const legacy = newName(); // uploaded before ownership was recorded: no row
    names.push(mine, theirs, legacy);
    const me = randomUUID();
    await access.record(mine, me);
    await access.record(theirs, randomUUID());

    await access.markPrivate([`/uploads/${mine}`, `/uploads/${theirs}`, `/uploads/${legacy}`], me);

    expect(await access.isPrivate(mine)).toBe(true);
    expect(await access.isPrivate(theirs)).toBe(false);
    expect(await access.isPrivate(legacy)).toBe(false);
  });

  it('records chat files as private from the start', async () => {
    const name = newName();
    names.push(name);
    await access.record(name, randomUUID(), true);
    expect(await access.isPrivate(name)).toBe(true);
  });
});

import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { ContentService } from './content.service';
import { SettingsService } from './settings.service';

/**
 * Against real Postgres (sc_test). Only touches support-contact settings and
 * the vendor terms, which no other spec reads, so suites running in parallel
 * are unaffected.
 */
const TEST_DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://sc:sc@localhost:5433/sc_test';

describe('SettingsService and ContentService', () => {
  let prisma: PrismaService;
  let adminId: string;

  beforeAll(async () => {
    prisma = new PrismaService(
      new ConfigService({ DATABASE_URL: TEST_DATABASE_URL, NODE_ENV: 'test' }),
    );
    await prisma.onModuleInit();
    adminId = (
      await prisma.adminUser.create({
        data: {
          email: `settings-spec-${String(Date.now())}@example.com`,
          passwordHash: 'x',
          displayName: 'Settings spec',
          role: 'owner',
        },
      })
    ).id;
  });

  beforeEach(async () => {
    await prisma.platformSetting.deleteMany({
      where: { key: { in: ['supportEmail', 'supportHours'] } },
    });
    await prisma.contentDocument.deleteMany({ where: { key: 'terms-vendors' } });
  });

  afterAll(async () => {
    await prisma.platformSetting.deleteMany({
      where: { key: { in: ['supportEmail', 'supportHours'] } },
    });
    await prisma.contentDocument.deleteMany({ where: { key: 'terms-vendors' } });
    await prisma.adminUser.delete({ where: { id: adminId } });
    await prisma.onModuleDestroy();
  });

  it('uses the console value over the environment variable, and Reset brings the environment back', async () => {
    const settings = new SettingsService(prisma, { SUPPORT_EMAIL: 'env@example.com' });
    expect(await settings.get('supportEmail')).toBe('env@example.com');

    const saved = await settings.set('supportEmail', 'help@example.com', adminId);
    expect(saved).toMatchObject({
      value: 'help@example.com',
      source: 'console',
      fallbackValue: 'env@example.com',
      env: 'SUPPORT_EMAIL',
    });
    expect(await settings.get('supportEmail')).toBe('help@example.com');

    const reset = await settings.set('supportEmail', null, adminId);
    expect(reset).toMatchObject({ value: 'env@example.com', source: 'environment' });
    expect(await settings.get('supportEmail')).toBe('env@example.com');
  });

  it('falls back to the built-in default when neither is set', async () => {
    const settings = new SettingsService(prisma, {});
    const row = (await settings.list()).find((item) => item.key === 'supportHours');
    expect(row).toMatchObject({ value: '', source: 'default' });
    expect((await settings.list()).find((item) => item.key === 'coinUsdCents')?.value).toBe(20);
  });

  it('rejects unknown keys, out-of-range values and inconsistent combinations without saving', async () => {
    const settings = new SettingsService(prisma, {});
    await expect(settings.set('noSuchSetting', 1, adminId)).rejects.toThrow(/Unknown setting/);
    await expect(settings.set('coinUsdCents', 0, adminId)).rejects.toThrow(/between 1 and/);
    await expect(settings.set('coinUsdCents', 2.5, adminId)).rejects.toThrow(/whole number/);
    // Default range is 10-120 in steps of 5: a minimum above the maximum, or
    // a step that doesn't divide the range, would break the request screen.
    await expect(settings.set('budgetMinUsd', 500, adminId)).rejects.toThrow(/cannot be above/);
    await expect(settings.set('budgetStepUsd', 7, adminId)).rejects.toThrow(/divide evenly/);
    expect(
      await prisma.platformSetting.count({
        where: { key: { in: ['coinUsdCents', 'budgetMinUsd', 'budgetStepUsd'] } },
      }),
    ).toBe(0);
  });

  it('a value saved on one instance reaches another once its cache expires', async () => {
    const reader = new SettingsService(prisma, {});
    expect(await reader.get('supportHours')).toBe('');
    await new SettingsService(prisma, {}).set('supportHours', 'Mon-Fri 8-5', adminId);
    // Still cached on the reader...
    expect(await reader.get('supportHours')).toBe('');
    // ...but the console list always reads fresh.
    expect((await reader.list()).find((item) => item.key === 'supportHours')?.value).toBe(
      'Mon-Fri 8-5',
    );
  });

  it('serves the placeholder until staff save terms, then counts versions', async () => {
    const content = new ContentService(prisma);
    const placeholder = await content.get('terms-vendors');
    expect(placeholder).toMatchObject({ isPlaceholder: true, version: 0, updatedAt: null });
    expect(placeholder.body).toMatch(/placeholder/);

    const first = await content.save(
      'terms-vendors',
      { title: 'Vendor terms', body: 'Version one' },
      adminId,
    );
    expect(first).toMatchObject({ isPlaceholder: false, version: 1, body: 'Version one' });

    const second = await content.save(
      'terms-vendors',
      { title: 'Vendor terms', body: 'Version two' },
      adminId,
    );
    expect(second).toMatchObject({ version: 2, body: 'Version two' });

    await expect(content.get('terms-unknown')).rejects.toThrow(/Unknown document/);
  });
});

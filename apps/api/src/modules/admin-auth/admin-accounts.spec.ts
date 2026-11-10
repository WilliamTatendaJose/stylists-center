import { describe, expect, it } from 'vitest';
import { bootstrapFirstAdmin, resetAdminPassword } from './admin-accounts';
import { verifyPassword } from './password';

interface Admin {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  disabled: boolean;
  deletedAt: Date | null;
  tokenVersion: number;
}
interface RefreshToken {
  adminUserId: string;
  revoked: boolean;
}

/** In-memory stand-in for the slice of Prisma these helpers use. */
function fakeDb(admins: Partial<Admin>[] = [], tokens: RefreshToken[] = []) {
  const rows: Admin[] = admins.map((a, i) => ({
    id: `admin-${String(i)}`,
    email: `a${String(i)}@example.com`,
    passwordHash: 'x:y',
    displayName: 'Admin',
    disabled: false,
    deletedAt: null,
    tokenVersion: 0,
    ...a,
  }));
  const find = (where: { email?: string; id?: string }) =>
    rows.find((r) => (where.email ? r.email === where.email : r.id === where.id));
  const apply = (row: Admin, data: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(data)) {
      if (key === 'tokenVersion') row.tokenVersion += (value as { increment: number }).increment;
      else (row as unknown as Record<string, unknown>)[key] = value;
    }
    return row;
  };
  const db = {
    rows,
    tokens,
    adminUser: {
      count: ({ where }: { where: { disabled: boolean; deletedAt: null } }) =>
        Promise.resolve(
          rows.filter((r) => r.disabled === where.disabled && r.deletedAt === where.deletedAt)
            .length,
        ),
      findUnique: ({ where }: { where: { email: string } }) => Promise.resolve(find(where) ?? null),
      create: ({ data }: { data: Partial<Admin> }) => {
        const row = {
          id: `admin-${String(rows.length)}`,
          disabled: false,
          deletedAt: null,
          tokenVersion: 0,
          ...data,
        } as Admin;
        rows.push(row);
        return Promise.resolve(row);
      },
      update: ({
        where,
        data,
      }: {
        where: { email?: string; id?: string };
        data: Record<string, unknown>;
      }) => {
        const row = find(where);
        if (!row) throw new Error('no such admin');
        return Promise.resolve(apply(row, data));
      },
    },
    adminRefreshToken: {
      updateMany: ({ where }: { where: { adminUserId: string } }) => {
        for (const t of tokens) if (t.adminUserId === where.adminUserId) t.revoked = true;
        return Promise.resolve({ count: 0 });
      },
    },
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
  };
  return db as unknown as Parameters<typeof bootstrapFirstAdmin>[0] & typeof db;
}

const STRONG = 'correct-horse-battery';

describe('bootstrapFirstAdmin', () => {
  it('creates the first admin in an empty database', async () => {
    const db = fakeDb();
    expect(await bootstrapFirstAdmin(db, 'owner@example.com', STRONG)).toBe('created');
    expect(db.rows).toHaveLength(1);
    expect(await verifyPassword(STRONG, db.rows[0]?.passwordHash ?? '')).toBe(true);
  });

  it('leaves everything alone once any enabled admin exists', async () => {
    const db = fakeDb([{ email: 'owner@example.com', passwordHash: 'kept:hash' }]);
    expect(await bootstrapFirstAdmin(db, 'owner@example.com', STRONG)).toBe('skipped');
    expect(db.rows[0]?.passwordHash).toBe('kept:hash');
  });

  it('restores the named account when every admin is disabled or deleted', async () => {
    const db = fakeDb([
      { email: 'owner@example.com', disabled: true, deletedAt: new Date() },
      { email: 'other@example.com', disabled: true },
    ]);
    expect(await bootstrapFirstAdmin(db, 'owner@example.com', STRONG)).toBe('restored');
    const owner = db.rows[0];
    expect(owner?.disabled).toBe(false);
    expect(owner?.deletedAt).toBeNull();
    expect(owner?.tokenVersion).toBe(1);
    expect(await verifyPassword(STRONG, owner?.passwordHash ?? '')).toBe(true);
  });
});

describe('resetAdminPassword', () => {
  it('sets the password, re-enables, and signs out every session', async () => {
    const tokens = [
      { adminUserId: 'admin-0', revoked: false },
      { adminUserId: 'admin-1', revoked: false },
    ];
    const db = fakeDb(
      [{ email: 'owner@example.com', disabled: true }, { email: 'other@example.com' }],
      tokens,
    );
    expect(await resetAdminPassword(db, 'owner@example.com', STRONG)).toBe('reset');
    expect(await verifyPassword(STRONG, db.rows[0]?.passwordHash ?? '')).toBe(true);
    expect(db.rows[0]?.disabled).toBe(false);
    expect(db.rows[0]?.tokenVersion).toBe(1);
    expect(tokens.map((t) => t.revoked)).toEqual([true, false]);
  });

  it('refuses a short password and an unknown account unless asked to create it', async () => {
    const db = fakeDb();
    await expect(resetAdminPassword(db, 'x@example.com', 'short')).rejects.toThrow(/12/);
    await expect(resetAdminPassword(db, 'x@example.com', STRONG)).rejects.toThrow(/--create/);
    expect(await resetAdminPassword(db, 'x@example.com', STRONG, { create: true })).toBe('created');
  });
});

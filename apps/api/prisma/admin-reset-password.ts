import 'dotenv/config';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/index.js';
import { resetAdminPassword } from '../src/modules/admin-auth/admin-accounts.js';

/**
 * Break-glass admin password reset, for when nobody can sign in to the admin
 * console to use its Staff page. Run it where DATABASE_URL reaches the
 * database — on Railway, inside the api service:
 *
 *   railway ssh --service api
 *   pnpm admin:reset-password owner@example.com            # prompts, hidden
 *   pnpm admin:reset-password owner@example.com --create   # make it if missing
 *   pnpm admin:reset-password owner@example.com --clear-mfa  # also turn off 2FA (lost phone)
 *
 * ADMIN_NEW_PASSWORD is read instead of prompting, for non-interactive use.
 * Re-enables the account and signs out all of its sessions.
 */
async function promptHidden(question: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((arg) => !arg.startsWith('--'));
  if (!email) {
    throw new Error('Usage: pnpm admin:reset-password <email> [--create] [--clear-mfa]');
  }

  let password = process.env.ADMIN_NEW_PASSWORD;
  if (!password) {
    password = await promptHidden('New password: ');
    if ((await promptHidden('Repeat it: ')) !== password) throw new Error('Passwords differ.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const outcome = await resetAdminPassword(prisma, email, password, {
      create: args.includes('--create'),
      clearMfa: args.includes('--clear-mfa'),
    });
    // eslint-disable-next-line no-console
    console.log(
      outcome === 'created'
        ? `Created admin ${email}.`
        : `Password reset for ${email}${args.includes('--clear-mfa') ? ', two-factor sign-in turned off' : ''}; all its sessions signed out.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

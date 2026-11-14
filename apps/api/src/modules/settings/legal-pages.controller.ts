import { Controller, Get, Header, Param } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ContentService } from './content.service';

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const page = (title: string, body: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · StylistsCenter</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:720px;margin:0 auto;padding:32px 20px;line-height:1.6;color:#111}
h1{font-size:1.6rem;margin:0 0 8px}p{margin:0 0 14px}.meta{color:#666;font-size:.9rem;margin-bottom:24px}
ol{padding-left:20px}li{margin-bottom:8px}
</style>
</head>
<body>
${body}
</body>
</html>`;

/**
 * Public web pages the stores link to: the privacy policy and terms (the
 * same text staff edit on the console's Content page and the apps show), and
 * how to delete an account. Google Play requires both as web URLs on the
 * store listing, reachable without the app. Unprefixed (see main.ts) so the
 * links read naturally: /legal/privacy, /delete-account.
 */
@SkipThrottle()
@Controller()
export class LegalPagesController {
  constructor(private readonly content: ContentService) {}

  @Get('legal/:key')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async legal(@Param('key') key: string): Promise<string> {
    const doc = await this.content.get(key);
    const paragraphs = doc.body
      .split(/\n{2,}/)
      .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
      .join('\n');
    const updated = doc.updatedAt
      ? `Last updated ${new Date(doc.updatedAt).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}`
      : 'Draft';
    return page(
      doc.title,
      `<h1>${escapeHtml(doc.title)}</h1>\n<div class="meta">${updated}</div>\n${paragraphs}`,
    );
  }

  @Get('delete-account')
  @Header('Content-Type', 'text/html; charset=utf-8')
  deleteAccount(): string {
    return page(
      'Delete your account',
      `<h1>Delete your StylistsCenter account</h1>
<p>You can delete your account yourself in the Style Center app:</p>
<ol>
<li>Open the app and sign in.</li>
<li>Go to <strong>Profile</strong>.</li>
<li>Scroll to the bottom and tap <strong>Delete account</strong>, then <strong>Delete my account</strong>.</li>
</ol>
<p>Finish or cancel any open bookings and shop orders first; the app tells you if one is still open.</p>
<p><strong>What is deleted:</strong> your name, email, phone number, profile and portfolio photos, identity documents, sign-in, notification settings, and any coins or earnings left in your wallet.</p>
<p><strong>What is kept:</strong> records of past bookings, orders and payments, without your name, for as long as the law requires for financial and tax records, and so the other person's history stays correct.</p>
<p>If you can no longer sign in, contact StylistsCenter support from the app's Help page or through the contact details in the <a href="/legal/privacy">privacy policy</a>, and we will delete the account for you.</p>`,
    );
  }
}

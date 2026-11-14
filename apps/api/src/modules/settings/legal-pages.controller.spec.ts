import { describe, expect, it } from 'vitest';
import type { ContentService } from './content.service';
import { LegalPagesController } from './legal-pages.controller';

const content = {
  get: () =>
    Promise.resolve({
      key: 'privacy',
      title: 'Privacy policy',
      body: 'First <b>paragraph</b>.\n\nSecond line one\nline two',
      version: 2,
      isPlaceholder: false,
      updatedAt: '2026-11-14T10:00:00.000Z',
    }),
} as unknown as ContentService;

describe('LegalPagesController', () => {
  const controller = new LegalPagesController(content);

  it('renders the console text as an escaped web page', async () => {
    const html = await controller.legal('privacy');
    expect(html).toContain('<h1>Privacy policy</h1>');
    expect(html).toContain('<p>First &lt;b&gt;paragraph&lt;/b&gt;.</p>');
    expect(html).toContain('<p>Second line one<br>line two</p>');
    expect(html).toContain('Last updated 14 November 2026');
  });

  it('explains how to delete an account', () => {
    expect(controller.deleteAccount()).toContain('Delete account');
  });
});

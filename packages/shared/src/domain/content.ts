/**
 * Legal and help text that StylistsCenter edits itself in the admin console
 * (Content page), shown in the apps without a release.
 *
 * Until staff save a version, the apps show the placeholder below, clearly
 * marked as a draft, so the screens and links are in place for launch and the
 * wording can be dropped in later.
 */
export const CONTENT_KEYS = [
  'terms-clients',
  'terms-stylists',
  'terms-agents',
  'terms-vendors',
  'privacy',
] as const;
export type ContentKey = (typeof CONTENT_KEYS)[number];

export function isContentKey(key: string): key is ContentKey {
  return (CONTENT_KEYS as readonly string[]).includes(key);
}

export const CONTENT_TITLES: Record<ContentKey, string> = {
  'terms-clients': 'Terms and Conditions for clients',
  'terms-stylists': 'Terms and Conditions for stylists',
  'terms-agents': 'Terms and Conditions for agents',
  'terms-vendors': 'Terms and Conditions for vendors',
  privacy: 'Privacy policy',
};

/** Maximum length of one document's body. About 40 pages of text. */
export const CONTENT_BODY_MAX_LENGTH = 100_000;

function placeholder(audience: string): string {
  return [
    `These are the Terms and Conditions for ${audience} using StylistsCenter.`,
    '',
    'The final wording will be provided by StylistsCenter and published here before launch. Until then, this page is a placeholder.',
    '',
    'Questions in the meantime can be sent through Help and support in the app.',
  ].join('\n');
}

export const CONTENT_PLACEHOLDERS: Record<ContentKey, string> = {
  'terms-clients': placeholder('clients'),
  'terms-stylists': placeholder('stylists'),
  'terms-agents': placeholder('agents'),
  'terms-vendors': placeholder('vendors'),
  privacy: [
    'This is the StylistsCenter privacy policy.',
    '',
    'The final policy, explaining what personal information the app collects, why, how long it is kept and how to ask for it to be deleted, will be provided by StylistsCenter and published here before launch. Until then, this page is a placeholder.',
  ].join('\n'),
};

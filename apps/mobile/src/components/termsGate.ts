import type { TermsDocumentStatusDto } from '@sc/shared';

/** The documents still waiting for the user's agreement, in the order the server lists them. */
export function pendingTermsDocuments(
  docs: readonly TermsDocumentStatusDto[] | undefined,
): TermsDocumentStatusDto[] {
  return (docs ?? []).filter((doc) => !doc.accepted);
}

/**
 * First route segments where the gate stays out of the way: the sign-in screens,
 * so a user can always sign in, and the legal text itself, so they can read
 * what they are agreeing to.
 */
const EXEMPT_SEGMENTS: readonly string[] = ['(auth)', 'legal'];

export function isTermsGateExempt(firstSegment: string | undefined): boolean {
  return firstSegment !== undefined && EXEMPT_SEGMENTS.includes(firstSegment);
}

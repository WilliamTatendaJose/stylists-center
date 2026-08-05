/**
 * The stylist's inbox is the same screen as the client's — a conversation has
 * two ends and the API already returns whichever side the caller is on. Kept
 * as a re-export rather than a copy so the two can never drift.
 */
export { default } from '../(tabs)/messages';

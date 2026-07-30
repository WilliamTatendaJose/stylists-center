import { z } from 'zod';

export const conversationSchema = z.object({
  id: z.uuid(),
  counterpartyName: z.string(),
  tint: z.string(),
  initials: z.string(),
  lastMessagePreview: z.string(),
  lastMessageAt: z.iso.datetime(),
  unreadCount: z.number().int(),
});
export type ConversationDto = z.infer<typeof conversationSchema>;

export const messageSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  authorId: z.uuid(),
  /** True when the current viewer authored it — decides bubble side/colour. */
  mine: z.boolean(),
  text: z.string(),
  createdAt: z.iso.datetime(),
});
export type MessageDto = z.infer<typeof messageSchema>;

export const sendMessageSchema = z.object({
  text: z.string().min(1).max(2000),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/**
 * "Message" from a provider profile, booking row, Directions, or Trip only
 * ever knows a providerId, never a conversation id — this finds-or-creates
 * the 1:1 thread so the client never has to track conversation ids itself.
 */
export const startConversationSchema = z.object({
  providerId: z.uuid(),
});
export type StartConversationInput = z.infer<typeof startConversationSchema>;

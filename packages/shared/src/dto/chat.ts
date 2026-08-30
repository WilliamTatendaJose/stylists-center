import { z } from 'zod';
import { imageUrlSchema } from './uploads.js';

export const conversationSchema = z.object({
  id: z.uuid(),
  counterpartyName: z.string(),
  /** Present when the other participant has a public provider page. */
  counterpartyProviderId: z.uuid().optional(),
  tint: z.string(),
  initials: z.string(),
  /** The other person's public photo, when they have set one. */
  imageUrl: imageUrlSchema.optional(),
  lastMessagePreview: z.string(),
  /** Lets the inbox distinguish a sent preview from an incoming message. */
  lastMessageMine: z.boolean(),
  lastMessageAt: z.iso.datetime(),
  unreadCount: z.number().int(),
});
export type ConversationDto = z.infer<typeof conversationSchema>;

export const messageAttachmentSchema = z.object({
  id: z.uuid(),
  url: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
});
export type MessageAttachmentDto = z.infer<typeof messageAttachmentSchema>;

export const messageSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  authorId: z.uuid(),
  /** True when the current viewer authored it — decides bubble side/colour. */
  mine: z.boolean(),
  text: z.string(),
  /** For outgoing bubbles, whether the other participant has opened the thread since this was sent. */
  read: z.boolean(),
  attachments: z.array(messageAttachmentSchema),
  createdAt: z.iso.datetime(),
});
export type MessageDto = z.infer<typeof messageSchema>;

export const sendMessageSchema = z.object({
  // Attachment-only messages arrive as multipart requests with no text field.
  // ChatService enforces that at least text or one attachment is present.
  text: z.string().max(2000).optional().default(''),
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

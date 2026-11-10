import { createZodDto } from 'nestjs-zod';
import { messagesQuerySchema, sendMessageSchema, startConversationSchema } from '@sc/shared';

export class StartConversationDto extends createZodDto(startConversationSchema) {}
export class SendMessageDto extends createZodDto(sendMessageSchema) {}
export class MessagesQueryDto extends createZodDto(messagesQuerySchema) {}

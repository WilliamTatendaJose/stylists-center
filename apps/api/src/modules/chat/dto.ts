import { createZodDto } from 'nestjs-zod';
import { sendMessageSchema, startConversationSchema } from '@sc/shared';

export class StartConversationDto extends createZodDto(startConversationSchema) {}
export class SendMessageDto extends createZodDto(sendMessageSchema) {}

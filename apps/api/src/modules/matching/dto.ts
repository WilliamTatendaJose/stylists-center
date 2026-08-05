import { createZodDto } from 'nestjs-zod';
import { createMatchRequestSchema } from '@sc/shared';

export class CreateMatchRequestDto extends createZodDto(createMatchRequestSchema) {}

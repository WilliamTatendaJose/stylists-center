import { createZodDto } from 'nestjs-zod';
import { enrollAgentSchema } from '@sc/shared';

export class EnrollAgentDto extends createZodDto(enrollAgentSchema) {}

import { createZodDto } from 'nestjs-zod';
import { recordPayoutSchema } from '@sc/shared';

export class RecordPayoutDto extends createZodDto(recordPayoutSchema) {}

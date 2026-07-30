import { createZodDto } from 'nestjs-zod';
import { createReportSchema } from '@sc/shared';

export class CreateReportDto extends createZodDto(createReportSchema) {}

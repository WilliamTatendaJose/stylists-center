import { createZodDto } from 'nestjs-zod';
import { reviewVerificationSchema } from '@sc/shared';

export class ReviewVerificationDto extends createZodDto(reviewVerificationSchema) {}

import { createZodDto } from 'nestjs-zod';
import { createBookingSchema, createReviewSchema } from '@sc/shared';

export class CreateBookingDto extends createZodDto(createBookingSchema) {}
export class CreateReviewDto extends createZodDto(createReviewSchema) {}

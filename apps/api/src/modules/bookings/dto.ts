import { createZodDto } from 'nestjs-zod';
import { createBookingSchema, createReviewSchema, rescheduleBookingSchema } from '@sc/shared';

export class CreateBookingDto extends createZodDto(createBookingSchema) {}
export class CreateReviewDto extends createZodDto(createReviewSchema) {}
export class RescheduleBookingDto extends createZodDto(rescheduleBookingSchema) {}

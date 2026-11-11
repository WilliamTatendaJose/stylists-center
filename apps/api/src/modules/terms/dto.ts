import { createZodDto } from 'nestjs-zod';
import { acceptTermsSchema } from '@sc/shared';

export class AcceptTermsDto extends createZodDto(acceptTermsSchema) {}

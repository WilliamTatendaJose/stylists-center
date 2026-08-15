import { createZodDto } from 'nestjs-zod';
import { updateProviderAdminSchema } from '@sc/shared';

export class UpdateProviderAdminDto extends createZodDto(updateProviderAdminSchema) {}

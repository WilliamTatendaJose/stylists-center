import { createZodDto } from 'nestjs-zod';
import { createManualBanSchema, resolveAppealSchema, updateReportStatusSchema } from '@sc/shared';

export class UpdateReportStatusDto extends createZodDto(updateReportStatusSchema) {}
export class CreateManualBanDto extends createZodDto(createManualBanSchema) {}
export class ResolveAppealDto extends createZodDto(resolveAppealSchema) {}

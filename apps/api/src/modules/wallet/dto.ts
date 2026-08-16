import { createZodDto } from 'nestjs-zod';
import { claimReferralSchema, enrollAgentSchema } from '@sc/shared';

export class EnrollAgentDto extends createZodDto(enrollAgentSchema) {}
export class ClaimReferralDto extends createZodDto(claimReferralSchema) {}

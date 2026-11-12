import { createZodDto } from 'nestjs-zod';
import { claimReferralSchema, enrollAgentSchema, payAgentSubscriptionSchema } from '@sc/shared';

export class EnrollAgentDto extends createZodDto(enrollAgentSchema) {}
export class ClaimReferralDto extends createZodDto(claimReferralSchema) {}
export class PayAgentSubscriptionDto extends createZodDto(payAgentSubscriptionSchema) {}

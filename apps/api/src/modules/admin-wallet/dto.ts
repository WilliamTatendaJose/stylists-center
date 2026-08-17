import { createZodDto } from 'nestjs-zod';
import { recordCashOutSettlementSchema } from '@sc/shared';

export class RecordCashOutSettlementDto extends createZodDto(recordCashOutSettlementSchema) {}

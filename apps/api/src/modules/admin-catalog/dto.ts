import { createZodDto } from 'nestjs-zod';
import { cityInputSchema, createCategorySchema, updateCategorySchema } from '@sc/shared';

export class CreateCategoryDto extends createZodDto(createCategorySchema) {}
export class UpdateCategoryDto extends createZodDto(updateCategorySchema) {}
export class CityInputDto extends createZodDto(cityInputSchema) {}

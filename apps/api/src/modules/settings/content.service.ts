import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CONTENT_KEYS,
  CONTENT_PLACEHOLDERS,
  CONTENT_TITLES,
  type ContentDocumentDto,
  type ContentKey,
  isContentKey,
  type UpdateContentDocumentInput,
} from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';

/** Terms and privacy text, edited in the console, with built-in placeholders until then. */
@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  async get(key: string): Promise<ContentDocumentDto> {
    const valid = this.check(key);
    const row = await this.prisma.contentDocument.findUnique({ where: { key: valid } });
    return row
      ? {
          key: valid,
          title: row.title,
          body: row.body,
          version: row.version,
          isPlaceholder: false,
          updatedAt: row.updatedAt.toISOString(),
        }
      : this.placeholder(valid);
  }

  async list(): Promise<ContentDocumentDto[]> {
    return Promise.all(CONTENT_KEYS.map((key) => this.get(key)));
  }

  async save(
    key: string,
    input: UpdateContentDocumentInput,
    adminId: string,
  ): Promise<ContentDocumentDto> {
    const valid = this.check(key);
    await this.prisma.contentDocument.upsert({
      where: { key: valid },
      create: { key: valid, ...input, updatedByAdminId: adminId },
      update: { ...input, version: { increment: 1 }, updatedByAdminId: adminId },
    });
    return this.get(valid);
  }

  private check(key: string): ContentKey {
    if (!isContentKey(key)) throw new BadRequestException(`Unknown document: ${key}`);
    return key;
  }

  private placeholder(key: ContentKey): ContentDocumentDto {
    return {
      key,
      title: CONTENT_TITLES[key],
      body: CONTENT_PLACEHOLDERS[key],
      version: 0,
      isPlaceholder: true,
      updatedAt: null,
    };
  }
}

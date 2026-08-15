import { BadRequestException, Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import type { Env } from '../../config/env';
import { detectImageExtension, uploadDirectory } from '../provider/image-storage.service';

export const MAX_CHAT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_CHAT_ATTACHMENTS = 5;

export interface UploadedAttachmentFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export interface StoredAttachment {
  url: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

type FileSignature = 'jpg' | 'png' | 'webp' | 'pdf' | 'text' | 'ole' | 'zip';

const FILE_TYPES: Record<string, { mimeType: string; signature: FileSignature }> = {
  '.jpg': { mimeType: 'image/jpeg', signature: 'jpg' },
  '.jpeg': { mimeType: 'image/jpeg', signature: 'jpg' },
  '.png': { mimeType: 'image/png', signature: 'png' },
  '.webp': { mimeType: 'image/webp', signature: 'webp' },
  '.pdf': { mimeType: 'application/pdf', signature: 'pdf' },
  '.txt': { mimeType: 'text/plain', signature: 'text' },
  '.csv': { mimeType: 'text/csv', signature: 'text' },
  '.doc': { mimeType: 'application/msword', signature: 'ole' },
  '.xls': { mimeType: 'application/vnd.ms-excel', signature: 'ole' },
  '.docx': {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    signature: 'zip',
  },
  '.xlsx': {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    signature: 'zip',
  },
};

function validSignature(file: UploadedAttachmentFile, signature: FileSignature): boolean {
  const { buffer } = file;
  if (signature === 'jpg' || signature === 'png' || signature === 'webp') {
    return detectImageExtension(buffer) === signature;
  }
  if (signature === 'pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  if (signature === 'text') return !buffer.includes(0);
  if (signature === 'ole') {
    return buffer
      .subarray(0, 8)
      .equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  }
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function safeOriginalName(value: string): string {
  let cleaned = '';
  for (const character of basename(value)) {
    const code = character.charCodeAt(0);
    if (code > 31 && code !== 127) cleaned += character;
  }
  cleaned = cleaned.trim();
  return (cleaned || 'attachment').slice(0, 120);
}

/** Stores chat files under random server names while preserving a safe display name. */
@Injectable()
export class AttachmentStorageService implements OnModuleInit {
  private readonly directory: string;

  constructor(config: ConfigService<Env, true>) {
    this.directory = uploadDirectory(config);
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
  }

  async saveMany(files: UploadedAttachmentFile[]): Promise<StoredAttachment[]> {
    if (files.length > MAX_CHAT_ATTACHMENTS) {
      throw new BadRequestException(`Attach up to ${String(MAX_CHAT_ATTACHMENTS)} files at a time`);
    }

    return Promise.all(files.map((file) => this.save(file)));
  }

  private async save(file: UploadedAttachmentFile): Promise<StoredAttachment> {
    if (!file.buffer.length) throw new BadRequestException('Choose a file to attach');
    if (file.size > MAX_CHAT_ATTACHMENT_BYTES || file.buffer.length > MAX_CHAT_ATTACHMENT_BYTES) {
      throw new BadRequestException('Each attachment must be 10 MB or smaller');
    }

    const name = safeOriginalName(file.originalname);
    const extension = extname(name).toLowerCase();
    const fileType = FILE_TYPES[extension];
    if (!fileType || !validSignature(file, fileType.signature)) {
      throw new BadRequestException('Attach a JPEG, PNG, WebP, PDF, text, Word, or Excel file');
    }

    const storedName = `${randomUUID()}${extension === '.jpeg' ? '.jpg' : extension}`;
    await writeFile(resolve(this.directory, storedName), file.buffer, { flag: 'wx' });
    return {
      url: `/uploads/${storedName}`,
      name,
      mimeType: fileType.mimeType,
      sizeBytes: file.buffer.length,
    };
  }
}

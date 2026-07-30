import type { Server } from 'node:http';
import { Controller, Get, INestApplication, Post } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AuditInterceptor } from './audit.interceptor';
import { PrismaService } from '../prisma/prisma.service';

// A throwaway controller purely for exercising the interceptor's GET-skip
// and success-only rules against a real Nest HTTP pipeline, rather than
// against the real app's only current routes (both GET, both already
// excluded) — see the manual curl check this replaces.
@Controller()
class TestController {
  @Get('probe')
  get() {
    return { ok: true };
  }

  @Post('probe')
  postOk() {
    return { ok: true };
  }

  @Post('probe/fails')
  postFails() {
    throw new Error('boom');
  }
}

describe('AuditInterceptor', () => {
  // Pinning the generic to node:http's Server (rather than the untyped
  // default) is what makes getHttpServer() return a properly-typed value for
  // supertest, instead of `any` propagating into every request(...) call.
  let app: INestApplication<Server>;
  let create: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    create = vi.fn().mockResolvedValue(undefined);
    const prismaStub = { auditLog: { create } };

    const moduleRef = await Test.createTestingModule({
      controllers: [TestController],
      providers: [
        { provide: PrismaService, useValue: prismaStub },
        { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('does not log a GET request', async () => {
    await request(app.getHttpServer()).get('/probe').expect(200);
    expect(create).not.toHaveBeenCalled();
  });

  it('logs a successful non-GET request with method and path', async () => {
    await request(app.getHttpServer()).post('/probe').expect(201);
    expect(create).toHaveBeenCalledTimes(1);
    const [[{ data }]] = create.mock.calls as [[{ data: Record<string, unknown> }]];
    expect(data.action).toBe('POST /probe');
    expect(data.actorId).toBeNull();
  });

  it('does not log a request whose handler throws', async () => {
    await request(app.getHttpServer()).post('/probe/fails').expect(500);
    expect(create).not.toHaveBeenCalled();
  });

  it('never lets an audit-write failure surface as a request error', async () => {
    create.mockRejectedValueOnce(new Error('db down'));
    // The response must still succeed even though the audit write failed —
    // see the interceptor's .catch(), which exists specifically for this.
    await request(app.getHttpServer()).post('/probe').expect(201);
  });
});

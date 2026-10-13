/**
 * V15 — uma falha de upload no Cloudinary não pode derrubar o backend.
 *
 * O SDK `cloudinary` (1.x) cria uma promessa interna (Q) em todo upload; com `upload_stream`
 * essa promessa nunca chega a quem chamou e, quando o Cloudinary responde erro (ex.: 401
 * "Invalid api_key …"), ela rejeita sem ninguém escutar → `unhandledRejection` → o winston
 * (rejectionHandlers + exitOnError) encerrava o processo.
 *
 * Aqui o SDK real roda; só a requisição HTTPS para api.cloudinary.com é simulada com 401.
 */
import https from 'https';
import { EventEmitter } from 'events';
import { PassThrough, Writable } from 'stream';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import winston from 'winston';
import app from '../app';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import logger, { installUnhandledRejectionHandler, logUnhandledRejection } from '../config/logger';
import { uploadToCloudinary, uploadVideoToCloudinary } from '../utils/cloudinary';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cloudinary = require('cloudinary').v2;

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';
const FAKE_KEY = '721912345678901';
const FAKE_SECRET = 'segredoFalsoDoCloudinary123';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

let unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => { unhandled.push(reason); };

let logLines: string[] = [];
const captureTransport = new winston.transports.Stream({
  stream: new Writable({
    write(chunk, _enc, next) { logLines.push(String(chunk)); next(); },
  }),
});

let httpsSpy: jest.SpyInstance;
let cloudinaryCalls = 0;

/** Simula a resposta do Cloudinary (401 com a api_key na mensagem, como o real). */
function fakeCloudinary401(_opts: any, callback: (res: any) => void) {
  cloudinaryCalls += 1;
  const req: any = new Writable({ write(_c, _e, next) { next(); } });
  req.setTimeout = () => req;
  req.abort = () => undefined;
  req.on('finish', () => {
    setImmediate(() => {
      const res: any = new PassThrough();
      res.statusCode = 401;
      res.headers = { 'content-type': 'application/json' };
      callback(res);
      res.end(JSON.stringify({ error: { message: `Invalid api_key ${FAKE_KEY}` } }));
    });
  });
  return req;
}

const realRequest = https.request;

beforeAll(() => {
  cloudinary.config({ cloud_name: 'drop-teste', api_key: FAKE_KEY, api_secret: FAKE_SECRET });
  process.env.CLOUDINARY_API_KEY = FAKE_KEY;
  process.env.CLOUDINARY_API_SECRET = FAKE_SECRET;
  httpsSpy = jest.spyOn(https, 'request').mockImplementation(((opts: any, cb: any) => {
    const host = typeof opts === 'string' ? opts : opts?.hostname || opts?.host || '';
    if (String(host).includes('cloudinary.com')) return fakeCloudinary401(opts, cb);
    return (realRequest as any)(opts, cb);
  }) as any);
  logger.add(captureTransport);
  process.on('unhandledRejection', onUnhandled);
});

afterAll(() => {
  process.removeListener('unhandledRejection', onUnhandled);
  logger.remove(captureTransport);
  httpsSpy.mockRestore();
});

beforeEach(() => {
  unhandled = [];
  logLines = [];
  cloudinaryCalls = 0;
});

afterEach(async () => {
  await cleanupUsersByEmailDomain('@v15.test');
});

/** Espera o Q (nextTick + runAfter) e o event loop terem a chance de emitir a rejeição solta. */
const settle = () => new Promise((r) => setTimeout(r, 100));

async function createClient(): Promise<string> {
  const passwordHash = await bcrypt.hash('Senha123!', 4);
  const user = await prisma.user.create({
    data: {
      name: 'Cliente V15',
      email: `u-${Date.now()}-${Math.random().toString(36).slice(2)}@v15.test`,
      passwordHash, role: 'cliente' as Role, roles: ['cliente'] as Role[], activeRole: 'cliente' as Role,
      cpf: '52998224725',
      verification: { email: { status: 'verified' }, document: { status: 'none' } } as any,
    },
  });
  return jwt.sign({ id: user.id, role: 'cliente', activeRole: 'cliente', roles: ['cliente'] }, JWT_SECRET, { expiresIn: '1h' });
}

describe('V15: erro do Cloudinary não vira unhandledRejection', () => {
  it('POST /api/verification/document com 401 do Cloudinary responde 500 tratado e sem rejeição solta', async () => {
    const token = await createClient();
    const res = await request(app)
      .post('/api/verification/document')
      .set('Authorization', `Bearer ${token}`)
      .field('type', 'cpf')
      .attach('front', PNG, { filename: 'frente.png', contentType: 'image/png' })
      .attach('back', PNG, { filename: 'verso.png', contentType: 'image/png' });
    await settle();

    expect(cloudinaryCalls).toBeGreaterThan(0); // o SDK real chegou à rede (simulada)
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Erro ao enviar documento' });
    expect(unhandled).toEqual([]);
  });

  it('uploadToCloudinary rejeita com Error (status 401) e não deixa promessa solta', async () => {
    const err: any = await uploadToCloudinary(PNG, 'drop/teste').catch((e) => e);
    await settle();
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(401);
    expect(String(err.message)).not.toContain(FAKE_KEY);
    expect(unhandled).toEqual([]);
  });

  it('uploadVideoToCloudinary rejeita com Error (status 401) e não deixa promessa solta', async () => {
    const err: any = await uploadVideoToCloudinary(PNG, 'drop/teste/videos').catch((e) => e);
    await settle();
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(401);
    expect(String(err.message)).not.toContain(FAKE_KEY);
    expect(unhandled).toEqual([]);
  });

  it('o log do erro de upload não traz a api_key em claro', async () => {
    const token = await createClient();
    await request(app)
      .post('/api/verification/document')
      .set('Authorization', `Bearer ${token}`)
      .field('type', 'cpf')
      .attach('front', PNG, { filename: 'frente.png', contentType: 'image/png' })
      .attach('back', PNG, { filename: 'verso.png', contentType: 'image/png' });
    await settle();

    const all = logLines.join('\n');
    expect(all).toContain('Erro ao enviar documento');
    expect(all).toContain('api_key ***');
    expect(all).not.toContain(FAKE_KEY);
    expect(all).not.toContain(FAKE_SECRET);
  });
});

describe('V15: rejeição solta é logada e o processo segue vivo', () => {
  it('o logger não encerra o processo por unhandledRejection (sem rejectionHandlers do winston)', () => {
    // O RejectionHandler do winston com exitOnError=true chama process.exit; ele não pode estar ativo.
    expect((logger as any).rejections?.handlers?.size ?? 0).toBe(0);
  });

  it('installUnhandledRejectionHandler registra o handler no processo uma única vez', () => {
    const before = process.listeners('unhandledRejection').filter((l) => l === logUnhandledRejection).length;
    try {
      installUnhandledRejectionHandler();
      installUnhandledRejectionHandler();
      expect(process.listeners('unhandledRejection').filter((l) => l === logUnhandledRejection).length).toBe(before + 1);
    } finally {
      process.removeListener('unhandledRejection', logUnhandledRejection);
    }
  });

  it('logUnhandledRejection loga com logger.error, mascara a api_key e não chama process.exit', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
    try {
      logUnhandledRejection({ message: `Invalid api_key ${FAKE_KEY}`, http_code: 401, name: 'Error' });
      logUnhandledRejection(new Error(`Invalid api_key ${FAKE_KEY} api_secret=${FAKE_SECRET}`));
    } finally {
      exitSpy.mockRestore();
    }
    expect(exitSpy).not.toHaveBeenCalled();
    const all = logLines.join('\n');
    expect(all).toContain('unhandledRejection');
    expect(all).toContain('Invalid api_key ***');
    expect(all).not.toContain(FAKE_KEY);
    expect(all).not.toContain(FAKE_SECRET);
  });
});

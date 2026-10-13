/** D1 · P4.12 — o termo vigente vem com o resumo "o que mudou". */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { STORE_ASAAS_TERMS_VERSION, STORE_ASAAS_TERMS_TEXT, STORE_ASAAS_TERMS_CHANGES } from '../legal/storeAsaasTerms';

afterAll(async () => { await prisma.$disconnect(); });

describe('P4.12 — termo Asaas com "o que mudou"', () => {
  it('guarda: a versão vigente tem resumo não vazio (subir a versão exige escrever o resumo)', () => {
    const changes = STORE_ASAAS_TERMS_CHANGES[STORE_ASAAS_TERMS_VERSION];
    expect(Array.isArray(changes)).toBe(true);
    expect(changes.length).toBeGreaterThan(0);
    for (const c of changes) {
      expect(typeof c).toBe('string');
      expect(c.trim().length).toBeGreaterThan(0);
    }
  });

  it('GET /api/settings/store-asaas-terms devolve versão, texto e changes da versão vigente', async () => {
    const r = await request(app).get('/api/settings/store-asaas-terms');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      version: STORE_ASAAS_TERMS_VERSION,
      text: STORE_ASAAS_TERMS_TEXT,
      changes: STORE_ASAAS_TERMS_CHANGES[STORE_ASAAS_TERMS_VERSION],
    });
  });
});

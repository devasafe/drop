// src/services/__tests__/consent.service.test.ts
import { recordConsent } from '../consent.service';
import { prisma } from '../../lib/prisma';

jest.mock('../../lib/prisma', () => ({
  prisma: { consentLog: { create: jest.fn().mockResolvedValue({}) } },
}));

describe('recordConsent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('grava um registro para terms e outro para privacy com versão, IP e user-agent', async () => {
    await recordConsent({
      userId: 'u1', termsVersion: '1.0', privacyVersion: '1.0',
      ipAddress: '1.2.3.4', userAgent: 'jest',
    });
    const create = prisma.consentLog.create as jest.Mock;
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'u1', documentType: 'terms', version: '1.0', ipAddress: '1.2.3.4', userAgent: 'jest' }) });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'u1', documentType: 'privacy', version: '1.0' }) });
  });

  it('não lança se o create falhar (consentimento não deve derrubar o cadastro)', async () => {
    (prisma.consentLog.create as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    await expect(recordConsent({ userId: 'u1', termsVersion: '1.0', privacyVersion: '1.0' })).resolves.toBeUndefined();
  });
});

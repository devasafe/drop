// src/services/__tests__/consent.service.test.ts
import { recordConsent } from '../consent.service';
import { prisma } from '../../lib/prisma';

jest.mock('../../lib/prisma', () => ({
  prisma: { consentLog: { createMany: jest.fn().mockResolvedValue({}) } },
}));

describe('recordConsent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('grava um registro para terms e outro para privacy com versão, IP e user-agent, em uma única chamada atômica', async () => {
    await recordConsent({
      userId: 'u1', termsVersion: '1.0', privacyVersion: '1.0',
      ipAddress: '1.2.3.4', userAgent: 'jest',
    });
    const createMany = prisma.consentLog.createMany as jest.Mock;
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ documentType: 'terms', version: '1.0', userId: 'u1', ipAddress: '1.2.3.4', userAgent: 'jest' }),
        expect.objectContaining({ documentType: 'privacy', version: '1.0', userId: 'u1', ipAddress: '1.2.3.4', userAgent: 'jest' }),
      ]),
    });
  });

  it('não lança se o createMany falhar (consentimento não deve derrubar o cadastro)', async () => {
    (prisma.consentLog.createMany as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    await expect(recordConsent({ userId: 'u1', termsVersion: '1.0', privacyVersion: '1.0' })).resolves.toBeUndefined();
  });
});

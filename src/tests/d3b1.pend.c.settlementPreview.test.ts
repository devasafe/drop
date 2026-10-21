/**
 * Pendência C da D3b-1 — a prévia da troca para o modo SaaS não avisa mais de fases que já existem
 * ("Fase 2" e "Fase 3"). O risco do Pix automático ao motoboy depende da configuração real
 * (directTransfersEnabled); o do estorno diz o que de fato acontece quando o Asaas recusa.
 */
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { settlementSwitchPreview } from '../services/settlementSwitch';
import { snapshotPlatformConfig } from './helpers/pgCleanup';

let restore: () => Promise<void>;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => {
  await restore();
  await prisma.$disconnect();
});

const PIX_OFF = 'O Pix automático ao motoboy está desligado em Regras e taxas: com ele desligado, a loja paga o motoboy à mão.';
const REFUND_NOTE = 'Estorno que o Asaas recusar é tentado de novo sozinho; se esgotar as tentativas, fica para o admin em Estornos.';

describe('settlementSwitchPreview("direto")', () => {
  it('Pix automático desligado: aparece o risco novo e nenhum texto de "Fase 2"/"Fase 3"', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia', directTransfersEnabled: false } as any, 'test');
    const { risks } = await settlementSwitchPreview('direto');
    expect(risks).toContain(PIX_OFF);
    expect(risks).toContain(REFUND_NOTE);
    expect(risks.join('\n')).not.toMatch(/Fase 2|Fase 3|ainda não existe/);
  });

  it('Pix automático ligado: sem risco de Pix e sem textos antigos', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia', directTransfersEnabled: true } as any, 'test');
    const { risks } = await settlementSwitchPreview('direto');
    expect(risks).not.toContain(PIX_OFF);
    expect(risks.join('\n')).not.toMatch(/Pix automático|Fase 2|Fase 3|ainda não existe/);
    expect(risks).toContain(REFUND_NOTE);
  });
});

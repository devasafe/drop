import { Response } from 'express';
import dayjs from 'dayjs';
import { AuthenticatedRequest } from '../types';
import { findPrizeConfig, listDistributedPrizes, upsertPrizeConfig } from '../repositories/rankingPrize.repository';
import { findGamByUser, persistGam } from '../repositories/gamification.repository';
import walletService from '../services/wallet.prisma.service';
import userRepository from '../repositories/user.repository';
import { prisma } from '../lib/prisma';
import { emitGamificationBadgeUnlocked } from '../utils/socketEmitter';

async function prismaUsersByIds(ids: string[]): Promise<Map<string, any>> {
  const users = await prisma.user.findMany({ where: { id: { in: ids.map(String) } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [String(u.id), u]));
}

const DEFAULT_PRIZES = [
  { position: 1, amount: 500, type: 'wallet' as const },
  { position: 2, amount: 300, type: 'wallet' as const },
  { position: 3, amount: 150, type: 'wallet' as const },
];

// GET /ranking-prizes — config do mês atual (qualquer um pode ver)
export const getCurrentPrizes = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const month = dayjs().month() + 1;
    const year = dayjs().year();
    const config = await findPrizeConfig(month, year);
    return res.json({
      month,
      year,
      prizes: config?.prizes ?? DEFAULT_PRIZES,
      distributed: config?.distributed ?? false,
      distributedAt: config?.distributedAt ?? null,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar prêmios' });
  }
};

// GET /ranking-prizes/history — meses anteriores
export const getPrizeHistory = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const history = await listDistributedPrizes(12);
    // `distributedBy` era populado com {name}: fazemos o lookup manual e reexpomos.
    const byIds = [...new Set(history.map((h) => h.distributedBy).filter(Boolean))] as string[];
    const users = byIds.length
      ? await prismaUsersByIds(byIds)
      : new Map<string, any>();
    const enriched = history.map((h) => ({
      ...h,
      distributedBy: h.distributedBy ? { _id: h.distributedBy, name: users.get(String(h.distributedBy))?.name } : null,
    }));
    return res.json(enriched);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
};

// PUT /ranking-prizes — CEO configura prêmios do mês
export const setPrizes = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { month, year, prizes } = req.body;

    if (!Array.isArray(prizes) || prizes.length === 0) {
      return res.status(400).json({ error: 'prizes deve ser um array não vazio' });
    }
    for (const p of prizes) {
      if (!p.position || p.amount == null || p.amount < 0) {
        return res.status(400).json({ error: 'Cada prêmio precisa de position e amount válidos' });
      }
    }

    const targetMonth = month ?? dayjs().month() + 1;
    const targetYear = year ?? dayjs().year();

    const config = await upsertPrizeConfig(
      targetMonth,
      targetYear,
      { prizes, createdBy: String(userId) },
      { distributed: false },
    );

    return res.json(config);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao salvar prêmios' });
  }
};

// GET /ranking-prizes/config-status — estado do freio (prêmios ligados/pausados)
export const getRankingPrizesEnabled = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const { getPlatformConfig } = await import('../repositories/platformConfig.repository');
    const platform = await getPlatformConfig();
    return res.json({ rankingPrizesEnabled: !!platform?.rankingPrizesEnabled });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao ler configuração' });
  }
};

// PUT /ranking-prizes/config-status — CEO liga/pausa os prêmios do ranking
export const setRankingPrizesEnabled = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled deve ser boolean' });
    const { updatePlatformConfig } = await import('../repositories/platformConfig.repository');
    const cfg = await updatePlatformConfig({ rankingPrizesEnabled: enabled }, req.user?.id || 'system');
    return res.json({ rankingPrizesEnabled: !!cfg?.rankingPrizesEnabled });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao salvar configuração' });
  }
};

// POST /ranking-prizes/distribute — CEO distribui prêmios do mês encerrado
export const distributePrizes = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { month, year } = req.body;

    // 🔒 Freio de custo: prêmios de ranking pausados (ex.: fase grátis de lançamento).
    const { getPlatformConfig } = await import('../repositories/platformConfig.repository');
    const platform = await getPlatformConfig();
    if (!platform?.rankingPrizesEnabled) {
      return res.status(403).json({
        error: 'Os prêmios do ranking estão PAUSADOS. Ative em Configurações para poder distribuir.',
        code: 'RANKING_PRIZES_PAUSED',
      });
    }

    const targetMonth = month ?? dayjs().subtract(1, 'month').month() + 1;
    const targetYear = year ?? (month === 1 ? dayjs().year() - 1 : dayjs().year());

    const config = await findPrizeConfig(targetMonth, targetYear);
    if (config?.distributed) {
      return res.status(409).json({ error: 'Prêmios deste mês já foram distribuídos' });
    }

    const prizes = config?.prizes ?? DEFAULT_PRIZES;

    // Calcular ranking do mês alvo
    const start = dayjs(`${targetYear}-${String(targetMonth).padStart(2, '0')}-01`).startOf('month').format('YYYY-MM-DD');
    const end = dayjs(`${targetYear}-${String(targetMonth).padStart(2, '0')}-01`).endOf('month').format('YYYY-MM-DD');

    const { listAllGam } = await import('../repositories/gamification.repository');
    const gamifications = await listAllGam();
    const ranking: { user_id: string; pontosMes: number }[] = [];
    for (const g of gamifications) {
      const user = await userRepository.findById(String(g.user_id)) as any;
      if (!user || (user.role !== 'motoboy' && !user.roles?.includes('motoboy'))) continue;
      const pontosMes = (g.history || [])
        .filter(h => h.date >= start && h.date <= end)
        .reduce((acc, h) => acc + (h.points > 0 ? h.points : 0), 0);
      if (pontosMes > 0) ranking.push({ user_id: g.user_id, pontosMes });
    }
    ranking.sort((a, b) => b.pontosMes - a.pontosMes);

    const results: { position: number; userId: string; amount: number; type: string; credited: boolean }[] = [];

    for (const prize of prizes) {
      const winner = ranking[prize.position - 1];
      if (!winner) continue;

      if (prize.type === 'wallet') {
        try {
          // Prêmio entra como crédito (categoria 'deposit' — sem 'bonus' no enum).
          await walletService.credit({
            owner: String(winner.user_id), ownerType: 'motoboy', amount: prize.amount,
            reason: `Prêmio ranking ${targetMonth}/${targetYear} — ${prize.position}º lugar`, category: 'deposit',
          });
          results.push({ position: prize.position, userId: winner.user_id, amount: prize.amount, type: 'wallet', credited: true });
        } catch {
          results.push({ position: prize.position, userId: winner.user_id, amount: prize.amount, type: 'wallet', credited: false });
        }
      } else {
        results.push({ position: prize.position, userId: winner.user_id, amount: prize.amount, type: 'manual', credited: false });
      }

      // Conceder badges de ranking
      try {
        const gam = await findGamByUser(winner.user_id);
        if (gam) {
          const newBadges: string[] = [];
          if (prize.position === 1 && !gam.badges.includes('Campeão do Mês')) {
            gam.badges.push('Campeão do Mês');
            newBadges.push('Campeão do Mês');
          }
          if (prize.position <= 3 && !gam.badges.includes('Pódio')) {
            gam.badges.push('Pódio');
            newBadges.push('Pódio');
          }
          if (newBadges.length > 0) {
            await persistGam(gam);
            newBadges.forEach(b => emitGamificationBadgeUnlocked(winner.user_id, b));
          }
        }
      } catch { /* não bloquear a distribuição por erro de badge */ }
    }

    // Marcar como distribuído
    await upsertPrizeConfig(
      targetMonth,
      targetYear,
      { distributed: true, distributedAt: new Date(), distributedBy: String(userId) },
      { prizes: DEFAULT_PRIZES, createdBy: String(userId) },
    );

    return res.json({ success: true, results });
  } catch (err) {
    console.error('[distributePrizes]', err);
    return res.status(500).json({ error: 'Erro ao distribuir prêmios' });
  }
};

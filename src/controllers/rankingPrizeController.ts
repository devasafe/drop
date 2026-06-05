import { Response } from 'express';
import dayjs from 'dayjs';
import { AuthenticatedRequest } from '../types';
import RankingPrize from '../models/RankingPrize';
import Gamification from '../models/Gamification';
import Wallet from '../models/Wallet';
import User from '../models/User';
import { emitGamificationBadgeUnlocked } from '../utils/socketEmitter';

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
    const config = await RankingPrize.findOne({ month, year });
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
    const history = await RankingPrize.find({ distributed: true })
      .sort({ year: -1, month: -1 })
      .limit(12)
      .populate('distributedBy', 'name')
      .lean();
    return res.json(history);
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

    const config = await RankingPrize.findOneAndUpdate(
      { month: targetMonth, year: targetYear },
      {
        prizes,
        createdBy: userId,
        $setOnInsert: { distributed: false },
      },
      { upsert: true, new: true }
    );

    return res.json(config);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao salvar prêmios' });
  }
};

// POST /ranking-prizes/distribute — CEO distribui prêmios do mês encerrado
export const distributePrizes = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { month, year } = req.body;

    const targetMonth = month ?? dayjs().subtract(1, 'month').month() + 1;
    const targetYear = year ?? (month === 1 ? dayjs().year() - 1 : dayjs().year());

    const config = await RankingPrize.findOne({ month: targetMonth, year: targetYear });
    if (config?.distributed) {
      return res.status(409).json({ error: 'Prêmios deste mês já foram distribuídos' });
    }

    const prizes = config?.prizes ?? DEFAULT_PRIZES;

    // Calcular ranking do mês alvo
    const start = dayjs(`${targetYear}-${String(targetMonth).padStart(2, '0')}-01`).startOf('month').format('YYYY-MM-DD');
    const end = dayjs(`${targetYear}-${String(targetMonth).padStart(2, '0')}-01`).endOf('month').format('YYYY-MM-DD');

    const gamifications = await Gamification.find();
    const ranking: { user_id: string; pontosMes: number }[] = [];
    for (const g of gamifications) {
      const user = await User.findById(g.user_id);
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
          let wallet = await Wallet.findOne({ owner: winner.user_id, ownerType: 'motoboy' });
          if (wallet) {
            wallet.balance += prize.amount;
            wallet.totalIncome += prize.amount;
            (wallet.history as any[]).push({
              date: new Date(),
              type: 'credit',
              category: 'bonus',
              amount: prize.amount,
              reason: `Prêmio ranking ${targetMonth}/${targetYear} — ${prize.position}º lugar`,
            });
            await wallet.save();
            results.push({ position: prize.position, userId: winner.user_id, amount: prize.amount, type: 'wallet', credited: true });
          } else {
            results.push({ position: prize.position, userId: winner.user_id, amount: prize.amount, type: 'wallet', credited: false });
          }
        } catch {
          results.push({ position: prize.position, userId: winner.user_id, amount: prize.amount, type: 'wallet', credited: false });
        }
      } else {
        results.push({ position: prize.position, userId: winner.user_id, amount: prize.amount, type: 'manual', credited: false });
      }

      // Conceder badges de ranking
      try {
        const gam = await Gamification.findOne({ user_id: winner.user_id });
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
            await gam.save();
            newBadges.forEach(b => emitGamificationBadgeUnlocked(winner.user_id, b));
          }
        }
      } catch { /* não bloquear a distribuição por erro de badge */ }
    }

    // Marcar como distribuído
    await RankingPrize.findOneAndUpdate(
      { month: targetMonth, year: targetYear },
      {
        distributed: true,
        distributedAt: new Date(),
        distributedBy: userId,
        $setOnInsert: { prizes: DEFAULT_PRIZES, createdBy: userId },
      },
      { upsert: true }
    );

    return res.json({ success: true, results });
  } catch (err) {
    console.error('[distributePrizes]', err);
    return res.status(500).json({ error: 'Erro ao distribuir prêmios' });
  }
};

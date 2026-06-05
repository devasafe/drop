import dayjs from 'dayjs';
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Gamification, { IGamification, GamificationLevel } from '../models/Gamification';
import Delivery from '../models/Delivery';
import User from '../models/User';
import Wallet from '../models/Wallet';
import { BENEFITS } from '../config/benefits';
import { emitGamificationPointsEarned, emitGamificationBadgeUnlocked, emitRankingUpdated } from '../utils/socketEmitter';
import { AuthenticatedRequest } from '../types';

// Thresholds de nível
export function getLevel(totalPoints: number): GamificationLevel {
  if (totalPoints >= 10000) return 'Lendário';
  if (totalPoints >= 6000) return 'Diamante';
  if (totalPoints >= 3000) return 'Platina';
  if (totalPoints >= 1500) return 'Ouro';
  if (totalPoints >= 500) return 'Prata';
  return 'Bronze';
}

export function getLevelThresholds() {
  return [
    { level: 'Bronze', min: 0, max: 499 },
    { level: 'Prata', min: 500, max: 1499 },
    { level: 'Ouro', min: 1500, max: 2999 },
    { level: 'Platina', min: 3000, max: 5999 },
    { level: 'Diamante', min: 6000, max: 9999 },
    { level: 'Lendário', min: 10000, max: Infinity },
  ];
}

// Todos os badges com seus metadados (para o frontend mostrar locked/unlocked)
export const ALL_BADGES = [
  // Existentes
  { id: 'Primeira entrega', label: 'Primeira Entrega', icon: '🚀', description: 'Completou sua primeira entrega avaliada', category: 'entrega' },
  { id: 'Motoboy 5 estrelas', label: 'Motoboy 5 Estrelas', icon: '⭐', description: 'Recebeu 5 avaliações com nota máxima', category: 'qualidade' },
  { id: 'Sem reclamações', label: 'Sem Reclamações', icon: '🛡️', description: '10+ entregas todas com nota 3 ou mais', category: 'qualidade' },
  // Volume de entregas
  { id: '10 Missões', label: '10 Missões', icon: '🏃', description: 'Completou 10 entregas', category: 'volume' },
  { id: '50 Missões', label: '50 Missões', icon: '💪', description: 'Completou 50 entregas', category: 'volume' },
  { id: 'Centurião', label: 'Centurião', icon: '⚔️', description: 'Completou 100 entregas', category: 'volume' },
  { id: 'Mestre das Ruas', label: 'Mestre das Ruas', icon: '🗺️', description: 'Completou 250 entregas', category: 'volume' },
  { id: 'Lenda Viva', label: 'Lenda Viva', icon: '🔥', description: 'Completou 500 entregas', category: 'volume' },
  { id: 'Imortal', label: 'Imortal', icon: '👑', description: 'Completou 1000 entregas', category: 'volume' },
  // Qualidade
  { id: 'Impecável', label: 'Impecável', icon: '💫', description: 'Recebeu 20 avaliações com nota 5', category: 'qualidade' },
  { id: 'Nota Máxima', label: 'Nota Máxima', icon: '🏆', description: 'Média ≥ 4.9 com 30+ avaliações', category: 'qualidade' },
  // Consistência
  { id: 'Dedicado', label: 'Dedicado', icon: '📅', description: 'Entregou em 3 dias diferentes na semana', category: 'consistencia' },
  { id: 'Incansável', label: 'Incansável', icon: '⚡', description: '7 dias seguidos com ao menos 1 entrega', category: 'consistencia' },
  { id: 'Máquina', label: 'Máquina', icon: '🤖', description: '20 dias com entrega no mês corrente', category: 'consistencia' },
  // Horário
  { id: 'Madrugador', label: 'Madrugador', icon: '🌅', description: '5 entregas antes das 8h', category: 'horario' },
  { id: 'Noturno', label: 'Noturno', icon: '🌙', description: '5 entregas após as 22h', category: 'horario' },
  { id: 'Guerreiro do FDS', label: 'Guerreiro do FDS', icon: '🎯', description: '10 entregas em fins de semana', category: 'horario' },
  // Distância
  { id: 'Corredor', label: 'Corredor', icon: '🏎️', description: 'Acumulou 100km em entregas', category: 'distancia' },
  { id: 'Maratonista', label: 'Maratonista', icon: '🏅', description: 'Acumulou 500km em entregas', category: 'distancia' },
  { id: 'Explorador Urbano', label: 'Explorador Urbano', icon: '🗺️', description: 'Acumulou 1000km em entregas', category: 'distancia' },
  // Nível
  { id: 'Escalando', label: 'Escalando', icon: '📈', description: 'Atingiu o nível Prata', category: 'nivel' },
  { id: 'Ouro Puro', label: 'Ouro Puro', icon: '🥇', description: 'Atingiu o nível Ouro', category: 'nivel' },
  { id: 'Elite', label: 'Elite', icon: '💎', description: 'Atingiu o nível Platina', category: 'nivel' },
  { id: 'Diamante', label: 'Diamante', icon: '💠', description: 'Atingiu o nível Diamante', category: 'nivel' },
  { id: 'Lendário', label: 'Lendário', icon: '👑', description: 'Atingiu o nível Lendário', category: 'nivel' },
  // Especiais
  { id: 'Velocista', label: 'Velocista', icon: '⚡', description: '5 entregas concluídas em menos de 20 minutos', category: 'especial' },
  { id: 'Campeão do Mês', label: 'Campeão do Mês', icon: '🏆', description: 'Ficou em 1º lugar no ranking mensal', category: 'especial' },
  { id: 'Pódio', label: 'Pódio', icon: '🥉', description: 'Ficou no top 3 do ranking mensal', category: 'especial' },
];

// Verifica e concede badges baseados nas stats do motoboy
export const checkAndAwardBadges = async (
  motoboyId: string | Types.ObjectId,
  gamification: IGamification
): Promise<string[]> => {
  const mid = motoboyId.toString();
  const newBadges: string[] = [];

  const already = (badge: string) => gamification.badges.includes(badge);
  const award = (badge: string) => {
    if (!already(badge)) {
      gamification.badges.push(badge);
      newBadges.push(badge);
    }
  };

  // --- Volume de entregas ---
  const totalDeliveries = await Delivery.countDocuments({ motoboyId, status: 'delivered' });
  if (totalDeliveries >= 1) award('Primeira entrega');
  if (totalDeliveries >= 10) award('10 Missões');
  if (totalDeliveries >= 50) award('50 Missões');
  if (totalDeliveries >= 100) award('Centurião');
  if (totalDeliveries >= 250) award('Mestre das Ruas');
  if (totalDeliveries >= 500) award('Lenda Viva');
  if (totalDeliveries >= 1000) award('Imortal');

  // --- Qualidade ---
  const totalAvaliacoes = await Delivery.countDocuments({ motoboyId, rating: { $exists: true, $ne: null } });
  const maxRatings = await Delivery.countDocuments({ motoboyId, rating: 5 });
  if (maxRatings >= 5) award('Motoboy 5 estrelas');
  if (maxRatings >= 20) award('Impecável');

  if (totalAvaliacoes >= 10) {
    const goodDeliveries = await Delivery.countDocuments({ motoboyId, rating: { $gte: 3 } });
    if (goodDeliveries === totalAvaliacoes) award('Sem reclamações');
  }

  if (totalAvaliacoes >= 30) {
    const avgResult = await Delivery.aggregate([
      { $match: { motoboyId: new Types.ObjectId(mid), rating: { $exists: true, $ne: null } } },
      { $group: { _id: null, avg: { $avg: '$rating' } } },
    ]);
    if (avgResult[0]?.avg >= 4.9) award('Nota Máxima');
  }

  // --- Distância acumulada ---
  const distResult = await Delivery.aggregate([
    { $match: { motoboyId: new Types.ObjectId(mid), status: 'delivered' } },
    { $group: { _id: null, total: { $sum: '$distance' } } },
  ]);
  const totalKm = distResult[0]?.total || 0;
  if (totalKm >= 100) award('Corredor');
  if (totalKm >= 500) award('Maratonista');
  if (totalKm >= 1000) award('Explorador Urbano');

  // --- Horário ---
  const earlyDeliveries = await Delivery.countDocuments({
    motoboyId,
    status: 'delivered',
    $expr: { $lt: [{ $hour: '$updatedAt' }, 8] },
  });
  if (earlyDeliveries >= 5) award('Madrugador');

  const nightDeliveries = await Delivery.countDocuments({
    motoboyId,
    status: 'delivered',
    $expr: { $gte: [{ $hour: '$updatedAt' }, 22] },
  });
  if (nightDeliveries >= 5) award('Noturno');

  const weekendDeliveries = await Delivery.countDocuments({
    motoboyId,
    status: 'delivered',
    $expr: { $in: [{ $dayOfWeek: '$updatedAt' }, [1, 7]] }, // 1=Dom, 7=Sáb
  });
  if (weekendDeliveries >= 10) award('Guerreiro do FDS');

  // --- Consistência ---
  const weekStart = dayjs().startOf('week').toDate();
  const weekDeliveries = await Delivery.find({
    motoboyId,
    status: 'delivered',
    updatedAt: { $gte: weekStart },
  }).select('updatedAt').lean();
  const distinctDaysThisWeek = new Set(weekDeliveries.map(d => dayjs(d.updatedAt as Date).format('YYYY-MM-DD'))).size;
  if (distinctDaysThisWeek >= 3) award('Dedicado');

  const monthStart = dayjs().startOf('month').toDate();
  const monthDeliveries = await Delivery.find({
    motoboyId,
    status: 'delivered',
    updatedAt: { $gte: monthStart },
  }).select('updatedAt').lean();
  const distinctDaysThisMonth = new Set(monthDeliveries.map(d => dayjs(d.updatedAt as Date).format('YYYY-MM-DD'))).size;
  if (distinctDaysThisMonth >= 20) award('Máquina');

  // Incansável: 7 dias seguidos (verifica se há entrega nos últimos 7 dias distintos consecutivos)
  if (!already('Incansável') && totalDeliveries >= 7) {
    const last30Days = await Delivery.find({
      motoboyId,
      status: 'delivered',
      updatedAt: { $gte: dayjs().subtract(30, 'day').toDate() },
    }).select('updatedAt').lean();
    const daySet = new Set(last30Days.map(d => dayjs(d.updatedAt as Date).format('YYYY-MM-DD')));
    let maxStreak = 0;
    let streak = 0;
    for (let i = 0; i < 30; i++) {
      const day = dayjs().subtract(i, 'day').format('YYYY-MM-DD');
      if (daySet.has(day)) {
        streak++;
        maxStreak = Math.max(maxStreak, streak);
      } else {
        streak = 0;
      }
    }
    if (maxStreak >= 7) award('Incansável');
  }

  // --- Velocista: 5 entregas em menos de 20 min ---
  if (!already('Velocista')) {
    const fastDeliveries = await Delivery.countDocuments({
      motoboyId,
      status: 'delivered',
      $expr: {
        $lte: [{ $subtract: ['$updatedAt', '$createdAt'] }, 20 * 60 * 1000],
      },
    });
    if (fastDeliveries >= 5) award('Velocista');
  }

  // --- Badges de nível ---
  const lvl = gamification.level;
  if (['Prata', 'Ouro', 'Platina', 'Diamante', 'Lendário'].includes(lvl)) award('Escalando');
  if (['Ouro', 'Platina', 'Diamante', 'Lendário'].includes(lvl)) award('Ouro Puro');
  if (['Platina', 'Diamante', 'Lendário'].includes(lvl)) award('Elite');
  if (['Diamante', 'Lendário'].includes(lvl)) award('Diamante');
  if (lvl === 'Lendário') award('Lendário');

  return newBadges;
};

// Ranking mensal dos motoboys
export const getMonthlyRanking = async (_req: Request, res: Response) => {
  const start = dayjs().startOf('month').format('YYYY-MM-DD');
  const end = dayjs().endOf('month').format('YYYY-MM-DD');
  const gamifications = await Gamification.find();
  const ranking = [];
  for (const g of gamifications) {
    const user = await User.findById(g.user_id);
    if (!user || (user.role !== 'motoboy' && !user.roles?.includes('motoboy'))) continue;
    const pontosMes = (g.history || [])
      .filter(h => h.date >= start && h.date <= end)
      .reduce((acc, h) => acc + (h.points > 0 ? h.points : 0), 0);
    ranking.push({
      user_id: g.user_id,
      name: user.name,
      pontosMes,
      level: g.level,
      badges: g.badges,
      posicao: 0,
    });
  }
  ranking.sort((a, b) => b.pontosMes - a.pontosMes);
  ranking.forEach((r, i) => { r.posicao = i + 1; });
  emitRankingUpdated(ranking);
  return res.json(ranking);
};

export const getGamification = async (req: Request, res: Response) => {
  const { user_id } = req.params;
  if (user_id === 'ranking-mensal') {
    return res.status(400).json({ error: 'user_id inválido' });
  }
  let gam = await Gamification.findOne({ user_id });
  if (!gam) {
    gam = new Gamification({ user_id });
    await gam.save();
  }
  return res.json(gam);
};

export const addPoints = async (req: Request, res: Response) => {
  const { user_id } = req.params;
  const { action = 'corrida', points = 20 } = req.body;
  let gam = await Gamification.findOne({ user_id });
  if (!gam) gam = new Gamification({ user_id });

  gam.points += points;
  gam.totalPoints += Math.max(0, points);
  gam.history.push({ date: new Date().toISOString().slice(0, 10), action, points });
  const newLevel = getLevel(gam.totalPoints);
  const levelChanged = newLevel !== gam.level;
  gam.level = newLevel;

  if (levelChanged) {
    const newBadges = await checkAndAwardBadges(user_id, gam);
    newBadges.forEach(b => emitGamificationBadgeUnlocked(user_id, b));
  }

  await gam.save();
  emitGamificationPointsEarned(user_id, { points, totalPoints: gam.totalPoints, level: gam.level });
  emitRankingUpdated({ user_id, points: gam.points, level: gam.level });
  return res.json(gam);
};

export const getRanking = async (_req: Request, res: Response) => {
  const top = await Gamification.find().sort({ points: -1 }).limit(100);
  if (!Array.isArray(top)) return res.json([]);
  const withNames = await Promise.all(top.map(async (g) => {
    const user = await User.findById(g.user_id);
    return { ...g.toObject(), name: user?.name || '' };
  }));
  emitRankingUpdated(withNames);
  return res.json(withNames);
};

export const getBenefits = (_req: Request, res: Response) => {
  return res.json(BENEFITS);
};

export const redeem = async (req: AuthenticatedRequest, res: Response) => {
  const { user_id, benefit: benefitId } = req.body;
  const benefitDef = BENEFITS.find(b => b.id === benefitId);
  if (!benefitDef) return res.status(400).json({ error: 'Benefício inválido' });

  let gam = await Gamification.findOne({ user_id });
  if (!gam || gam.points < benefitDef.cost) return res.status(400).json({ error: 'Pontos insuficientes' });

  gam.points -= benefitDef.cost;
  gam.history.push({ date: new Date().toISOString().slice(0, 10), action: `Resgate: ${benefitDef.name}`, points: -benefitDef.cost });
  await gam.save();

  // Se o benefício credita carteira, faz o crédito
  if (benefitDef.type === 'wallet') {
    const creditAmount = benefitId === 'wallet_bonus_20' ? 20 : 50;
    try {
      let wallet = await Wallet.findOne({ owner: user_id, ownerType: 'motoboy' });
      if (wallet) {
        wallet.balance += creditAmount;
        wallet.totalIncome += creditAmount;
        (wallet.history as any[]).push({
          date: new Date(),
          type: 'credit',
          category: 'bonus',
          amount: creditAmount,
          reason: `Resgate de benefício: ${benefitDef.name}`,
        });
        await wallet.save();
      }
    } catch (err) {
      console.error('[redeem] Erro ao creditar carteira:', err);
    }
  }

  return res.json({ success: true, gam, benefit: benefitDef });
};

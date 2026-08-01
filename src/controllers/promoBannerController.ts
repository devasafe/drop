import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { uploadToCloudinary } from '../utils/cloudinary';

const withId = (b: any) => ({ ...b, _id: b.id });
const ORDER = [{ sortOrder: 'asc' as const }, { createdAt: 'desc' as const }];

/** Público — banners de aviso ativos, na ordem de exibição (carrossel da home). */
export const listActiveBanners = async (_req: Request, res: Response) => {
  try {
    const banners = await prisma.promoBanner.findMany({ where: { active: true }, orderBy: ORDER });
    return res.json(banners.map(withId));
  } catch (err) {
    console.error('[promoBanner.listActive] error:', err);
    return res.status(500).json({ error: 'Erro ao listar avisos' });
  }
};

/** Admin — todos os banners (ativos e inativos). */
export const listAllBanners = async (_req: Request, res: Response) => {
  try {
    const banners = await prisma.promoBanner.findMany({ orderBy: ORDER });
    return res.json(banners.map(withId));
  } catch (err) {
    console.error('[promoBanner.listAll] error:', err);
    return res.status(500).json({ error: 'Erro ao listar avisos' });
  }
};

/** Admin — cria um banner. `imageUrl` é obrigatório (vem do upload). */
export const createBanner = async (req: Request, res: Response) => {
  try {
    const { imageUrl, linkUrl, title, active, sortOrder } = req.body || {};
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl é obrigatório' });
    const banner = await prisma.promoBanner.create({
      data: {
        imageUrl,
        linkUrl: linkUrl || null,
        title: title || null,
        active: active !== false,
        sortOrder: Number(sortOrder) || 0,
      },
    });
    return res.status(201).json(withId(banner));
  } catch (err) {
    console.error('[promoBanner.create] error:', err);
    return res.status(500).json({ error: 'Erro ao criar aviso' });
  }
};

/** Admin — atualiza campos do banner (parcial). */
export const updateBanner = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { imageUrl, linkUrl, title, active, sortOrder } = req.body || {};
    const data: any = {};
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    if (linkUrl !== undefined) data.linkUrl = linkUrl || null;
    if (title !== undefined) data.title = title || null;
    if (active !== undefined) data.active = !!active;
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder) || 0;
    const banner = await prisma.promoBanner.update({ where: { id }, data });
    return res.json(withId(banner));
  } catch (err) {
    console.error('[promoBanner.update] error:', err);
    return res.status(500).json({ error: 'Erro ao atualizar aviso' });
  }
};

/** Admin — remove um banner. */
export const deleteBanner = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.promoBanner.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[promoBanner.delete] error:', err);
    return res.status(500).json({ error: 'Erro ao remover aviso' });
  }
};

/** Admin — sobe a imagem do banner pro Cloudinary e devolve a URL. */
export const uploadBannerImage = async (req: any, res: Response) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    const imageUrl = await uploadToCloudinary(file.buffer, 'drop/banners');
    return res.json({ imageUrl });
  } catch (err) {
    console.error('[promoBanner.upload] error:', err);
    return res.status(500).json({ error: 'Falha no upload' });
  }
};

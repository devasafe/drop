import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';
import { emitCategoryCreated, emitCategoryUpdated } from '../utils/socketEmitter';

// List categories for a store
export const listCategories = async (req: Request, res: Response) => {
  try {
    const { storeId } = req.query;
    if (!storeId) return res.status(400).json({ error: 'Missing storeId' });
    const categories = await prisma.category.findMany({ where: { storeId: String(storeId) } });
    // `_id` junto de `id`: o frontend ainda lê `_id`.
    return res.json(categories.map((c) => ({ ...c, _id: c.id })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to list categories' });
  }
};

// Create category (only store owner)
export const createCategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { storeId, name } = req.body;
    if (!storeId || !name) return res.status(400).json({ error: 'Missing storeId or name' });
    const store = await prisma.store.findUnique({ where: { id: String(storeId) } });
    if (!store) return res.status(404).json({ error: 'Store not found' });
    if (!req.user || String(store.ownerId) !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden - not store owner' });
    }
    const exists = await prisma.category.findFirst({ where: { storeId: String(storeId), name } });
    if (exists) return res.status(400).json({ error: 'Category already exists' });

    const category = await prisma.category.create({ data: { storeId: String(storeId), name } });

    // Broadcast category creation
    emitCategoryCreated(category);

    return res.status(201).json({ ...category, _id: category.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create category' });
  }
};

// Update category name (only store owner)
export const updateCategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) return res.status(404).json({ error: 'Category not found' });
    const store = await prisma.store.findUnique({ where: { id: String(category.storeId) } });
    if (!store) return res.status(404).json({ error: 'Store not found' });
    if (!req.user || String(store.ownerId) !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden - not store owner' });
    }

    const updated = await prisma.category.update({ where: { id }, data: { name } });

    // Broadcast category update
    emitCategoryUpdated(updated);

    return res.json({ ...updated, _id: updated.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update category' });
  }
};

// Delete category (only store owner)
export const deleteCategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) return res.status(404).json({ error: 'Category not found' });
    const store = await prisma.store.findUnique({ where: { id: String(category.storeId) } });
    if (!store) return res.status(404).json({ error: 'Store not found' });
    if (!req.user || String(store.ownerId) !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden - not store owner' });
    }
    await prisma.category.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete category' });
  }
};

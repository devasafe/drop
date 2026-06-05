import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import Category from '../models/Category';
import Store from '../models/Store';
import { emitCategoryCreated, emitCategoryUpdated } from '../utils/socketEmitter';

// List categories for a store
export const listCategories = async (req: Request, res: Response) => {
  try {
    const { storeId } = req.query;
    if (!storeId) return res.status(400).json({ error: 'Missing storeId' });
    const categories = await Category.find({ storeId }).lean();
    return res.json(categories);
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
    const store = await Store.findById(storeId);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    if (!req.user || store.ownerId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden - not store owner' });
    }
    const exists = await Category.findOne({ storeId, name });
    if (exists) return res.status(400).json({ error: 'Category already exists' });
    const category = new Category({ storeId, name });
    await category.save();
    
    // Broadcast category creation
    emitCategoryCreated(category.toObject());
    
    return res.status(201).json(category);
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
    const category = await Category.findById(id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    const store = await Store.findById(category.storeId);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    if (!req.user || store.ownerId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden - not store owner' });
    }
    category.name = name;
    await category.save();
    
    // Broadcast category update
    emitCategoryUpdated(category.toObject());
    
    return res.json(category);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update category' });
  }
};

// Delete category (only store owner)
export const deleteCategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    const store = await Store.findById(category.storeId);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    if (!req.user || store.ownerId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden - not store owner' });
    }
    await category.deleteOne();
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete category' });
  }
};

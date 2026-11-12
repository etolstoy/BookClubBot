import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { getCollections, getCollection, getCollectionBook } from '../../services/collection.service.js';

export function createCollectionsRouter(db: PrismaClient=prisma) {
  const router = Router();
  router.get('/', async (_req, res) => {
    try {res.json({collections:await getCollections(db)});}
    catch {res.status(500).json({error:'Не удалось загрузить подборки'});}
  });
  router.get('/:slug/books/:workId', async (req, res) => {
    try {
      const result = await getCollectionBook(req.params.slug,req.params.workId,db);
      if (!result) {res.status(404).json({error:'Книга не найдена'});return;}
      res.json(result);
    } catch {
      res.status(500).json({error:'Не удалось загрузить книгу'});
    }
  });
  router.get('/:slug', async (req, res) => {
    try {
      const collection = await getCollection(req.params.slug, db);
      if (!collection) { res.status(404).json({error:'Подборка не найдена'}); return; }
      res.json({collection});
    } catch (error) {
      console.error('Error fetching collection:', error);
      res.status(500).json({error:'Не удалось загрузить подборку'});
    }
  });
  return router;
}

export default createCollectionsRouter();

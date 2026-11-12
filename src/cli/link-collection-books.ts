import 'dotenv/config';
import prisma from '../lib/prisma.js';
import { linkCollectionBooks } from '../services/collection.service.js';

try {
  const result=await linkCollectionBooks();
  console.log('Collection catalogue links:',result);
} catch(error) {
  console.error('Could not link collection books:',error);
  process.exitCode=1;
} finally {
  await prisma.$disconnect();
}

#!/usr/bin/env tsx
/**
 * Fixtures Editor Server
 *
 * A simple Express server for editing test fixtures in the browser
 *
 * Usage: npm run fixtures:edit
 */

import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const FIXTURES_PATH = path.join(process.cwd(), 'test/fixtures/reviews/anonymized-samples.json');

// Serve the editor HTML page
app.get('/', async (req, res) => {
  const htmlPath = path.join(__dirname, 'fixtures-editor.html');
  res.sendFile(htmlPath);
});

// Get all fixtures
app.get('/api/fixtures', async (req, res) => {
  try {
    const data = await fs.readFile(FIXTURES_PATH, 'utf-8');
    const fixtures = JSON.parse(data);
    res.json(fixtures);
  } catch (error) {
    console.error('Error reading fixtures:', error);
    res.status(500).json({ error: 'Failed to read fixtures' });
  }
});

// Update a specific review
app.patch('/api/fixtures/:index', async (req, res) => {
  try {
    const index = parseInt(req.params.index);
    const updatedReview = req.body;

    // Read current fixtures
    const data = await fs.readFile(FIXTURES_PATH, 'utf-8');
    const fixtures = JSON.parse(data);

    // Validate index
    if (index < 0 || index >= fixtures.reviews.length) {
      return res.status(400).json({ error: 'Invalid review index' });
    }

    // Update the review
    fixtures.reviews[index] = updatedReview;

    // Write back to file
    await fs.writeFile(FIXTURES_PATH, JSON.stringify(fixtures, null, 2), 'utf-8');

    res.json({ success: true, review: updatedReview });
  } catch (error) {
    console.error('Error updating fixture:', error);
    res.status(500).json({ error: 'Failed to update fixture' });
  }
});

// Save all fixtures
app.post('/api/fixtures/save-all', async (req, res) => {
  try {
    const fixtures = req.body;

    // Write back to file
    await fs.writeFile(FIXTURES_PATH, JSON.stringify(fixtures, null, 2), 'utf-8');

    res.json({ success: true, message: 'All fixtures saved successfully' });
  } catch (error) {
    console.error('Error saving fixtures:', error);
    res.status(500).json({ error: 'Failed to save fixtures' });
  }
});

// Create backup
app.post('/api/fixtures/backup', async (req, res) => {
  try {
    const data = await fs.readFile(FIXTURES_PATH, 'utf-8');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(
      process.cwd(),
      'test/fixtures/reviews',
      `anonymized-samples.backup-${timestamp}.json`
    );

    await fs.writeFile(backupPath, data, 'utf-8');

    res.json({ success: true, backupPath });
  } catch (error) {
    console.error('Error creating backup:', error);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

app.listen(PORT, () => {
  console.log('\n🎨 Fixtures Editor Server');
  console.log('========================\n');
  console.log(`✅ Server running at: http://localhost:${PORT}`);
  console.log(`📁 Editing: ${FIXTURES_PATH}`);
  console.log('\nOpen your browser to start editing!\n');
});

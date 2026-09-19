import express from 'express';
import path from 'path';
import fs from 'fs';
import { Notifier } from '../output/notifier';

const app = express();
const PORT = process.env.PORT || 3000;
const notifier = new Notifier();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Endpoint to serve latest report JSON
 */
app.get('/api/report', (req, res) => {
  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) {
    return res.status(404).json({ error: 'No reports generated yet.' });
  }

  const files = fs.readdirSync(reportsDir)
    .filter(f => f.startsWith('report-') && f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    return res.status(404).json({ error: 'No report file found.' });
  }

  const latestReport = fs.readFileSync(path.join(reportsDir, files[0]), 'utf-8');
  res.json(JSON.parse(latestReport));
});

/**
 * Webhook Endpoint to receive trigger alerts
 */
app.post('/api/alerts', async (req, res) => {
  const { coin } = req.body;
  if (coin) {
    await notifier.sendSignalAlert(coin);
    return res.json({ success: true });
  }
  res.status(400).json({ error: 'Missing coin data' });
});

export function startServer(): void {
  app.listen(PORT, () => {
    console.log(`🚀 Web Dashboard & Alerts Server running at http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startServer();
}


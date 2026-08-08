import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { toolRouter } from './tool.js';
import { pruneSessions } from './session.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use((req, _res, next) => {
  console.log(`[req] ${req.method} ${req.url}`);
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    stay22KeyConfigured: Boolean(config.stay22ApiKey),
    time: new Date().toISOString(),
  });
});

app.use('/api', toolRouter);

const cleaner = setInterval(pruneSessions, 5 * 60 * 1000);
cleaner.unref?.();

app.listen(config.port, () => {
  console.log(`Voyager backend running on http://localhost:${config.port}`);
  if (!config.stay22ApiKey) {
    console.warn('WARNING: No STAY22_API_KEY set — demo mode only (5 req/min by IP).');
  }
});

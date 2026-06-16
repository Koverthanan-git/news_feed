const express = require('express');
const morgan = require('morgan');
const useragent = require('useragent');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// ──────────────────────────────────────────────
// 1. WEB SERVER LOG FILE COLLECTION
// ──────────────────────────────────────────────

const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

// Apache Combined Log Format stream
const accessLogStream = fs.createWriteStream(
  path.join(logDir, 'access.log'),
  { flags: 'a' }
);

// Custom detailed JSON log stream
const detailedLogStream = fs.createWriteStream(
  path.join(logDir, 'detailed.log'),
  { flags: 'a' }
);

// Morgan: Apache Combined Log Format → access.log
app.use(morgan('combined', { stream: accessLogStream }));

// Custom middleware: rich JSON logging → detailed.log
app.use((req, res, next) => {
  const startTime = Date.now();
  const agent = useragent.parse(req.headers['user-agent']);

  res.on('finish', () => {
    const entry = {
      timestamp: new Date().toISOString(),
      ip: req.ip || req.connection.remoteAddress,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime: Date.now() - startTime + 'ms',
      userAgent: req.headers['user-agent'],
      browser: agent.toAgent(),
      os: agent.os.toString(),
      device: agent.device.toString(),
      referer: req.headers['referer'] || 'Direct',
      contentType: res.getHeader('content-type') || '-',
      contentLength: res.getHeader('content-length') || '-',
      acceptLanguage: req.headers['accept-language'] || '-',
      host: req.headers['host'] || '-',
      protocol: req.protocol,
      queryParams: JSON.stringify(req.query),
    };
    detailedLogStream.write(JSON.stringify(entry) + '\n');
  });

  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ──────────────────────────────────────────────
// API: Return server log data for the dashboard
// ──────────────────────────────────────────────

app.get('/api/logs/access', (req, res) => {
  const logPath = path.join(logDir, 'access.log');
  if (!fs.existsSync(logPath)) return res.json({ logs: [] });
  const raw = fs.readFileSync(logPath, 'utf-8');
  const lines = raw.trim().split('\n').filter(Boolean).slice(-50);
  res.json({ logs: lines });
});

app.get('/api/logs/detailed', (req, res) => {
  const logPath = path.join(logDir, 'detailed.log');
  if (!fs.existsSync(logPath)) return res.json({ logs: [] });
  const raw = fs.readFileSync(logPath, 'utf-8');
  const lines = raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(-100)
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean);
  res.json({ logs: lines });
});

app.get('/api/logs/clear', (req, res) => {
  fs.writeFileSync(path.join(logDir, 'access.log'), '');
  fs.writeFileSync(path.join(logDir, 'detailed.log'), '');
  res.json({ success: true });
});

// ──────────────────────────────────────────────
// SPA fallback — serve index.html for all routes
// ──────────────────────────────────────────────
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🌐  Web Analysis Server running at http://localhost:${PORT}`);
  console.log(`📁  Server logs → ${logDir}/`);
  console.log(`📊  Visit the site and navigate pages to generate log data\n`);
});

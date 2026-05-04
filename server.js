import http from 'http';
import { readFile } from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import { extname, join } from 'path';

const PORT = process.env.PORT || 3000;
const API_URL = 'https://api.prismagroup.online/api/trades/recent?limit=500&period=today';
const publicDir = join(process.cwd(), 'public');

let latestTrades = [];
let latestSnapshot = '';
const sseClients = new Set();

function normalizeTrade(t) {
  return {
    id: t.trade_id ?? String(t.id ?? ''),
    symbol: t.symbol ?? '???',
    side: t.option_type ?? '—',
    strike: Number(t.strike ?? 0),
    expiration: t.expiration ?? '—',
    entryPrice: Number(t.entry_price ?? 0),
    profitPerContract: Number(t.profit_per_contract ?? 0),
    profitPercentage: Number(t.profit_percentage ?? 0),
    profitDollars: Number(t.profit_dollars ?? 0),
    status: t.status ?? 'OPEN',
    createdAt: t.created_at ?? null,
    updatedAt: t.updated_at ?? null,
    highestPrice: t.highest_price ?? null,
    highestPriceSource: t.highest_price_source ?? null,
    signalSource: t.signal_source ?? null,
    channelName: t.channel_name ?? null,
    raw: t,
  };
}

function summarize(trades) {
  const wins = trades.filter(t => String(t.status).startsWith('WIN')).length;
  const losses = trades.filter(t => String(t.status).startsWith('LOSS')).length;
  const open = trades.filter(t => String(t.status).includes('OPEN')).length;
  const holding = trades.filter(t => String(t.status).includes('HOLD')).length;
  const totalPnl = trades.reduce((sum, t) => sum + (Number(t.profit_dollars) || 0), 0);
  return { total: trades.length, wins, losses, open, holding, totalPnl };
}

function sendSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event, data) {
  for (const res of sseClients) {
    try {
      sendSse(res, event, data);
    } catch {
      sseClients.delete(res);
    }
  }
}

async function fetchTrades() {
  const res = await fetch(API_URL, {
    headers: {
      'Accept': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Upstream status ${res.status}`);
  }
  const json = await res.json();
  const trades = Array.isArray(json) ? json : (json.trades ?? []);
  return trades.map(normalizeTrade);
}

async function refreshTrades() {
  try {
    const trades = await fetchTrades();
    const snapshot = JSON.stringify(trades.map(t => [t.id, t.updatedAt, t.status, t.profitDollars, t.highestPrice]));
    const prevById = new Map(latestTrades.map(t => [t.id, t]));
    const nextById = new Map(trades.map(t => [t.id, t]));

    const newTrades = trades.filter(t => !prevById.has(t.id));
    const updatedTrades = trades.filter(t => {
      const prev = prevById.get(t.id);
      return prev && (String(prev.updatedAt) !== String(t.updatedAt) || String(prev.status) !== String(t.status) || String(prev.profitDollars) !== String(t.profitDollars) || String(prev.highestPrice) !== String(t.highestPrice));
    });

    latestTrades = trades;
    latestSnapshot = snapshot;

    if (newTrades.length) {
      broadcast('new-trades', { trades: newTrades, summary: summarize(trades), updatedAt: new Date().toISOString() });
    }
    if (updatedTrades.length) {
      broadcast('updated-trades', { trades: updatedTrades, summary: summarize(trades), updatedAt: new Date().toISOString() });
    }

    broadcast('summary', { summary: summarize(trades), updatedAt: new Date().toISOString() });
    broadcast('snapshot', { trades, summary: summarize(trades), updatedAt: new Date().toISOString() });
  } catch (error) {
    broadcast('error', { message: error.message, at: new Date().toISOString() });
  }
}

setInterval(refreshTrades, 5000);
refreshTrades();

function serveFile(res, filePath) {
  const ext = extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml; charset=utf-8',
  };
  if (!existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/prisma/trades') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ trades: latestTrades, summary: summarize(latestTrades), updatedAt: new Date().toISOString() }));
    return;
  }

  if (url.pathname === '/api/prisma/refresh') {
    await refreshTrades();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, summary: summarize(latestTrades), updatedAt: new Date().toISOString() }));
    return;
  }

  if (url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('\n');
    sseClients.add(res);
    sendSse(res, 'connected', { ok: true, updatedAt: new Date().toISOString() });

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    serveFile(res, join(publicDir, 'index.html'));
    return;
  }

  const assetPath = join(publicDir, url.pathname);
  if (assetPath.startsWith(publicDir)) {
    serveFile(res, assetPath);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Prisma live monitor running on http://localhost:${PORT}`);
});

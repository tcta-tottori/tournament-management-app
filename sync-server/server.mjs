#!/usr/bin/env node
// =============================================
// マルチデバイス同期 — WebSocket 中継サーバー
//                     + Gemini TTS HTTP プロキシ
//
// 使い方:
//   node server.mjs [ポート番号]
//
// 例:
//   node server.mjs          → ポート 8787 で起動
//   node server.mjs 3030     → ポート 3030 で起動
//
// 環境変数:
//   GEMINI_API_KEY    Gemini API キー（TTS プロキシを有効にする場合に設定）
//   GEMINI_TTS_MODEL  使用するモデル名（既定: gemini-3.1-flash-preview-tts）
//
// クライアント側の設定:
//   中継サーバーURL に ws://<このPCのIPアドレス>:<ポート> を入力
//   例: ws://192.168.1.100:8787
// =============================================

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { networkInterfaces } from 'os';

const PORT = parseInt(process.argv[2] || '8787', 10);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-preview-tts';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** @type {Map<string, Set<import('ws').WebSocket>>} */
const rooms = new Map();

// ---------- HTTP サーバー（CORS 付き）----------
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function sendJson(res, status, obj) {
  res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

/** 24kHz / 16-bit / mono PCM を WAV (RIFF) コンテナで包む */
function pcmToWav(pcmBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcmBuffer]);
}

/** mimeType "audio/L16;rate=24000" などからサンプルレートを抜き取る */
function parseSampleRate(mimeType) {
  if (!mimeType) return 24000;
  const m = mimeType.match(/rate=(\d+)/);
  return m ? parseInt(m[1], 10) : 24000;
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); if (body.length > 1_000_000) reject(new Error('payload too large')); });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

async function handleGeminiTts(req, res) {
  if (!GEMINI_API_KEY) {
    return sendJson(res, 503, { error: 'GEMINI_API_KEY が未設定です。サーバー側の環境変数を確認してください。' });
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: 'invalid JSON body' });
  }
  const text = String(body.text || '').trim();
  if (!text) return sendJson(res, 400, { error: 'text is required' });

  const voiceName = String(body.voiceName || 'Kore');
  const model = String(body.model || GEMINI_TTS_MODEL);
  const styleInstruction = body.styleInstruction ? String(body.styleInstruction) : '';
  const promptText = styleInstruction ? `${styleInstruction}: ${text}` : text;

  const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const payload = {
    contents: [{ parts: [{ text: promptText }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
      },
    },
  };

  try {
    const apiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('[Gemini TTS] API error', apiRes.status, errText.slice(0, 500));
      return sendJson(res, apiRes.status, { error: `Gemini API error: ${apiRes.status}`, detail: errText.slice(0, 500) });
    }
    const json = await apiRes.json();
    const part = json?.candidates?.[0]?.content?.parts?.[0];
    const inline = part?.inlineData || part?.inline_data;
    if (!inline?.data) {
      return sendJson(res, 502, { error: 'audio data not returned', detail: JSON.stringify(json).slice(0, 500) });
    }
    const pcm = Buffer.from(inline.data, 'base64');
    const sampleRate = parseSampleRate(inline.mimeType || inline.mime_type);
    const wav = pcmToWav(pcm, sampleRate, 1, 16);
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'audio/wav', 'Content-Length': wav.length });
    res.end(wav);
  } catch (err) {
    console.error('[Gemini TTS] fetch failed', err);
    sendJson(res, 502, { error: 'upstream fetch failed', detail: String(err) });
  }
}

const httpServer = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const url = req.url || '/';

  if (req.method === 'GET' && (url === '/api/gemini-status' || url === '/api/gemini-tts/status')) {
    return sendJson(res, 200, {
      available: !!GEMINI_API_KEY,
      model: GEMINI_TTS_MODEL,
    });
  }

  if (req.method === 'POST' && url === '/api/gemini-tts') {
    return handleGeminiTts(req, res);
  }

  if (req.method === 'GET' && url === '/') {
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Tournament sync server is running. WebSocket on the same port.');
    return;
  }

  res.writeHead(404, CORS_HEADERS);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });

httpServer.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  大会運営 同期サーバー`);
  console.log(`  ポート: ${PORT}`);
  console.log(`  Gemini TTS: ${GEMINI_API_KEY ? `有効 (model=${GEMINI_TTS_MODEL})` : '無効 (GEMINI_API_KEY 未設定)'}`);
  console.log(`========================================`);
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  WS:   ws://${net.address}:${PORT}`);
        console.log(`  HTTP: http://${net.address}:${PORT}`);
      }
    }
  }
  console.log(`========================================\n`);
});

wss.on('connection', (ws) => {
  let currentRoom = '';

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // Ping
    if (data.action === 'ping') {
      try { ws.send(JSON.stringify({ action: 'pong' })); } catch { /* */ }
      return;
    }

    const { action, roomCode, payload } = data;

    // ルーム参加
    if (action === 'join' && roomCode) {
      // 既存ルームから離脱
      if (currentRoom) {
        const room = rooms.get(currentRoom);
        if (room) {
          room.delete(ws);
          if (room.size === 0) rooms.delete(currentRoom);
        }
      }
      currentRoom = roomCode;
      if (!rooms.has(roomCode)) rooms.set(roomCode, new Set());
      rooms.get(roomCode).add(ws);
      console.log(`[${roomCode}] 端末参加 (${rooms.get(roomCode).size}台)`);
      return;
    }

    // ルーム離脱
    if (action === 'leave') {
      if (currentRoom) {
        const room = rooms.get(currentRoom);
        if (room) {
          room.delete(ws);
          console.log(`[${currentRoom}] 端末離脱 (${room.size}台)`);
          if (room.size === 0) rooms.delete(currentRoom);
        }
        currentRoom = '';
      }
      return;
    }

    // ブロードキャスト
    if (action === 'broadcast' && roomCode && payload) {
      const room = rooms.get(roomCode);
      if (!room) return;
      const msg = JSON.stringify(payload);
      for (const client of room) {
        if (client !== ws && client.readyState === 1) {
          try { client.send(msg); } catch { /* */ }
        }
      }
    }
  });

  ws.on('close', () => {
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.delete(ws);
        console.log(`[${currentRoom}] 接続切断 (${room.size}台)`);
        if (room.size === 0) rooms.delete(currentRoom);
      }
    }
  });
});

// 定期的にルーム情報をログ出力
setInterval(() => {
  if (rooms.size > 0) {
    const info = [...rooms.entries()]
      .map(([code, clients]) => `${code}(${clients.size}台)`)
      .join(', ');
    console.log(`[状態] アクティブルーム: ${info}`);
  }
}, 60000);

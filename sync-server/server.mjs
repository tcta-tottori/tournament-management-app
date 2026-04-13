#!/usr/bin/env node
// =============================================
// マルチデバイス同期 — WebSocket 中継サーバー
//
// 使い方:
//   node server.mjs [ポート番号]
//
// 例:
//   node server.mjs          → ポート 8787 で起動
//   node server.mjs 3030     → ポート 3030 で起動
//
// クライアント側の設定:
//   中継サーバーURL に ws://<このPCのIPアドレス>:<ポート> を入力
//   例: ws://192.168.1.100:8787
// =============================================

import { WebSocketServer } from 'ws';

const PORT = parseInt(process.argv[2] || '8787', 10);

/** @type {Map<string, Set<import('ws').WebSocket>>} */
const rooms = new Map();

const wss = new WebSocketServer({ port: PORT });

console.log(`\n========================================`);
console.log(`  大会運営 同期サーバー`);
console.log(`  ポート: ${PORT}`);
console.log(`========================================`);

// ローカル IP アドレスを表示
import { networkInterfaces } from 'os';
const nets = networkInterfaces();
for (const name of Object.keys(nets)) {
  for (const net of nets[name] ?? []) {
    if (net.family === 'IPv4' && !net.internal) {
      console.log(`  接続先: ws://${net.address}:${PORT}`);
    }
  }
}
console.log(`========================================\n`);

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

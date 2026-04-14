// =============================================
// Vite プラグイン: 同期中継サーバー統合
//
// dev server に WebSocket 中継サーバーを組み込み、
// 別プロセスでの sync-server 起動を不要にする
// =============================================

import type { Plugin } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';

export function syncRelayPlugin(): Plugin {
  const WS_PATH = '/ws-sync';

  return {
    name: 'sync-relay',
    configureServer(server) {
      const rooms = new Map<string, Set<WebSocket>>();
      const wss = new WebSocketServer({ noServer: true });

      server.httpServer?.on('upgrade', (request, socket, head) => {
        if (request.url === WS_PATH) {
          wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
          });
        }
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
            if (currentRoom) {
              const room = rooms.get(currentRoom);
              if (room) {
                room.delete(ws);
                if (room.size === 0) rooms.delete(currentRoom);
              }
            }
            currentRoom = roomCode;
            if (!rooms.has(roomCode)) rooms.set(roomCode, new Set());
            rooms.get(roomCode)!.add(ws);
            console.log(`[Sync] [${roomCode}] 端末参加 (${rooms.get(roomCode)!.size}台)`);
            return;
          }

          // ルーム離脱
          if (action === 'leave') {
            if (currentRoom) {
              const room = rooms.get(currentRoom);
              if (room) {
                room.delete(ws);
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
              if (client !== ws && client.readyState === WebSocket.OPEN) {
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
              if (room.size === 0) rooms.delete(currentRoom);
            }
          }
        });
      });

      console.log(`[Sync] 中継サーバーを開発サーバーに統合しました (パス: ${WS_PATH})`);
    },
  };
}

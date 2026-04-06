/**
 * Cloudflare Worker — ライブデータ中継サーバー
 *
 * 運営システムが PUT でアップロードした JSON を KV に保存し、
 * 公開ページからの GET リクエストに応答する。
 *
 * KV Namespace: LIVE_DATA
 * 環境変数: API_KEY（書き込み認証用）
 *
 * セットアップ:
 *   1. wrangler init live-api
 *   2. wrangler kv:namespace create LIVE_DATA
 *   3. wrangler.toml に KV バインディングを追加
 *   4. wrangler secret put API_KEY
 *   5. wrangler deploy
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ───── PUT /api/publish/:tournamentId ─────
    // 運営システムからのデータアップロード
    const publishMatch = path.match(/^\/api\/publish\/(.+)$/);
    if (publishMatch && request.method === 'PUT') {
      // APIキー認証
      const apiKey = request.headers.get('X-API-Key');
      if (env.API_KEY && apiKey !== env.API_KEY) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }

      const tournamentId = publishMatch[1];
      const body = await request.text();

      // KV に保存（TTL: 24時間）
      await env.LIVE_DATA.put(`tournament:${tournamentId}`, body, {
        expirationTtl: 86400,
      });

      // 大会一覧にも登録
      const snapshot = JSON.parse(body);
      await updateTournamentList(env, tournamentId, snapshot);

      return jsonResponse({ ok: true, tournamentId, size: body.length });
    }

    // ───── GET /api/publish/:tournamentId ─────
    // 公開ページからのデータ取得
    if (publishMatch && request.method === 'GET') {
      const tournamentId = publishMatch[1];
      const data = await env.LIVE_DATA.get(`tournament:${tournamentId}`);

      if (!data) {
        return jsonResponse({ error: 'Not found' }, 404);
      }

      return new Response(data, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=10',
          ...CORS_HEADERS,
        },
      });
    }

    // ───── PUT /api/tournaments ─────
    // 大会一覧の手動更新
    if (path === '/api/tournaments' && request.method === 'PUT') {
      const apiKey = request.headers.get('X-API-Key');
      if (env.API_KEY && apiKey !== env.API_KEY) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }

      const body = await request.text();
      await env.LIVE_DATA.put('tournaments', body, { expirationTtl: 86400 });
      return jsonResponse({ ok: true });
    }

    // ───── GET /api/tournaments ─────
    // 大会一覧の取得
    if (path === '/api/tournaments' && request.method === 'GET') {
      const data = await env.LIVE_DATA.get('tournaments');
      if (!data) {
        return jsonResponse({ publishedAt: new Date().toISOString(), tournaments: [] });
      }
      return new Response(data, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=30',
          ...CORS_HEADERS,
        },
      });
    }

    // ───── ヘルスチェック ─────
    if (path === '/api/health') {
      return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
    }

    return jsonResponse({ error: 'Not found' }, 404);
  },
};

/**
 * 大会一覧を自動更新する
 */
async function updateTournamentList(env, tournamentId, snapshot) {
  try {
    const existing = await env.LIVE_DATA.get('tournaments');
    const list = existing ? JSON.parse(existing) : { publishedAt: '', tournaments: [] };

    // 既存の大会を更新、なければ追加
    const idx = list.tournaments.findIndex((t) => t.tournamentId === tournamentId);
    const tournamentSummary = {
      tournamentId: snapshot.tournament.tournamentId,
      name: snapshot.tournament.name,
      date: snapshot.tournament.date,
      venue: snapshot.tournament.venue,
      reserveDate: snapshot.tournament.reserveDate || '',
      reserveVenue: snapshot.tournament.reserveVenue || '',
      createdAt: snapshot.tournament.createdAt,
    };

    if (idx >= 0) {
      list.tournaments[idx] = tournamentSummary;
    } else {
      list.tournaments.push(tournamentSummary);
    }
    list.publishedAt = new Date().toISOString();

    await env.LIVE_DATA.put('tournaments', JSON.stringify(list), {
      expirationTtl: 86400,
    });
  } catch (err) {
    console.error('Failed to update tournament list:', err);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

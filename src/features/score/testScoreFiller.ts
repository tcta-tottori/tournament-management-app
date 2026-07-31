// =============================================================================
// テスト用スコア一括入力
//
// 動作確認のために、全種目（トーナメント・リーグ）の試合へ 8-4 / 6-4 の
// スコアを決勝まで入力する。トーナメントは勝者を次の回戦へ繰り上げながら
// 進めるので、決勝まで埋まった状態になる。
//
// ※ 運営画面（データ管理）からのみ実行できる。観戦用ページには出さない。
// =============================================================================

import { db, type Event, type Draw, type Match } from '../../db/database';
import { resolveRequiredGames } from './gameRules';

export interface FillTestScoresEventResult {
  eventName: string;
  type: 'tournament' | 'league';
  /** スコアを入れた試合数（不戦勝は含まない） */
  filled: number;
}

export interface FillTestScoresResult {
  eventCount: number;
  filledCount: number;
  details: FillTestScoresEventResult[];
}

/** ゲーム数が判定できない場合の既定値 */
const DEFAULT_GAMES = 8;

/** 種目がリーグ（総当たり）かどうか */
function isLeague(evt: Event, draw: Draw | undefined): boolean {
  const type = evt.type as string;
  if (type === 'league' || type === 'round-robin') return true;
  if (draw?.drawType === 'roundRobin') return true;
  const ds = draw?.drawSize ?? 0;
  if (ds > 0 && (ds & (ds - 1)) !== 0) return true;
  return /リーグ/i.test(evt.name || '');
}

/** 回戦別ルールを1つの文にまとめる（resolveRequiredGames が回戦スコープを解釈する） */
function gameRuleTextOf(evt: Event): string {
  const rules = evt.roundGameRules || [];
  if (rules.length === 0) return '';
  return rules.map(r => `${r.roundLabel} ${r.ruleText}`).join(' ');
}

/** テスト用スコア文字列。勝者のゲーム数は 8/6 など、敗者は4ゲーム。 */
function scoreFor(games: number, player1Wins: boolean): string {
  const loser = games > 4 ? 4 : Math.max(0, games - 2);
  return player1Wins ? `${games}-${loser}` : `${loser}-${games}`;
}

/** 実在の選手が入っているか（BYE・空欄でない） */
function hasPlayer(name: string | undefined | null): boolean {
  return !!name && name !== 'BYE' && name !== 'ｂｙｅ';
}

/**
 * 大会の全種目にテスト用スコアを入力する。
 * 既存のスコアは上書きされる（動作確認用のため）。
 */
export async function fillTestScores(tournamentId: string): Promise<FillTestScoresResult> {
  const events = await db.events.where('tournamentId').equals(tournamentId).toArray();
  const details: FillTestScoresEventResult[] = [];
  let filledCount = 0;
  const now = Date.now();

  for (const evt of events) {
    const matches = await db.matches.where('eventId').equals(evt.eventId).toArray();
    if (matches.length === 0) continue;
    const draw = await db.draws.where('eventId').equals(evt.eventId).first();
    const ruleText = gameRuleTextOf(evt);
    const fallbackGames = evt.gameRules?.games ?? DEFAULT_GAMES;
    let filled = 0;
    // 勝者を交互にして、リーグの順位や勝敗が偏らないようにする
    let turn = 0;

    if (isLeague(evt, draw)) {
      const games = resolveRequiredGames(ruleText, 1, 1) ?? fallbackGames;
      const ordered = [...matches].sort((a, b) => (a.matchOrder || 0) - (b.matchOrder || 0));
      for (const m of ordered) {
        if (!hasPlayer(m.player1Name) || !hasPlayer(m.player2Name)) continue;
        const p1Wins = turn++ % 2 === 0;
        m.score = scoreFor(games, p1Wins);
        m.status = 'finished';
        m.winnerEntryId = p1Wins ? m.player1EntryId : m.player2EntryId;
        m.updatedAt = now;
        filled++;
      }
      details.push({ eventName: evt.name, type: 'league', filled });
    } else {
      // トーナメント: 1回戦から順に埋め、勝者を次の回戦へ繰り上げる
      const totalRounds = draw && draw.drawSize > 1
        ? Math.round(Math.log2(draw.drawSize))
        : Math.max(...matches.map(m => m.round));
      const byKey = new Map<string, Match>();
      for (const m of matches) byKey.set(`${m.round}|${m.position}`, m);

      for (let round = 1; round <= totalRounds; round++) {
        const games = resolveRequiredGames(ruleText, round, totalRounds) ?? fallbackGames;
        const roundMatches = matches
          .filter(m => m.round === round)
          .sort((a, b) => a.position - b.position);

        for (const m of roundMatches) {
          const p1 = hasPlayer(m.player1Name);
          const p2 = hasPlayer(m.player2Name);
          if (!p1 && !p2) {
            // 両側が空（全てBYEの枠）＝行われない試合。進捗の分母から外れるよう不戦勝扱いにする
            if (m.status !== 'walkover') {
              m.status = 'walkover';
              m.score = '';
              m.winnerEntryId = null;
              m.updatedAt = now;
            }
            continue;
          }

          let p1Wins: boolean;
          if (p1 && p2) {
            p1Wins = turn++ % 2 === 0;
            m.score = scoreFor(games, p1Wins);
            m.status = 'finished';
            filled++;
          } else {
            // 片方だけ＝不戦勝。スコアは入れずに勝者だけ確定して次へ進める
            p1Wins = p1;
            m.status = 'walkover';
          }
          m.winnerEntryId = p1Wins ? m.player1EntryId : m.player2EntryId;
          m.updatedAt = now;

          // 勝者を次の回戦へ
          const next = byKey.get(`${round + 1}|${Math.ceil(m.position / 2)}`);
          if (next) {
            const winnerName = p1Wins ? m.player1Name : m.player2Name;
            const winnerAff = p1Wins ? m.player1Affiliation : m.player2Affiliation;
            const winnerId = p1Wins ? m.player1EntryId : m.player2EntryId;
            if (m.position % 2 === 1) {
              next.player1EntryId = winnerId;
              next.player1Name = winnerName;
              next.player1Affiliation = winnerAff;
            } else {
              next.player2EntryId = winnerId;
              next.player2Name = winnerName;
              next.player2Affiliation = winnerAff;
            }
            next.updatedAt = now;
          }
        }
      }
      details.push({ eventName: evt.name, type: 'tournament', filled });
    }

    if (filled > 0 || matches.some(m => m.status === 'walkover')) {
      await db.matches.bulkPut(matches);
    }
    filledCount += filled;
  }

  // 全試合が終了扱いになるため、コートの「進行中の試合」表示をクリアする
  const courts = await db.courts.where('tournamentId').equals(tournamentId).toArray();
  for (const c of courts) {
    if (c.id != null && c.currentMatchId) {
      await db.courts.update(c.id, { currentMatchId: null });
    }
  }

  return { eventCount: details.length, filledCount, details };
}

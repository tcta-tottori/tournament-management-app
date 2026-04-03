/**
 * ミックス大会 予選リーグ表のCanvas描画 (JPEG出力)
 * 添付画像のような罫線付きリーグ表を生成する
 */
import type { MixedLeague, MixedTeam, LeagueMatchScore, LeagueStanding } from './types';

const FONT_BASE = '"Yu Gothic", "Hiragino Sans", "Meiryo", sans-serif';

/** タイブレークスコア表示 */
function formatScoreText(match: LeagueMatchScore, rowTeamId: string): string {
  const isTeam1 = match.team1Id === rowTeamId;
  const myScore = isTeam1 ? match.score1 : match.score2;
  const oppScore = isTeam1 ? match.score2 : match.score1;
  const won = (isTeam1 && match.winnerId === match.team1Id) || (!isTeam1 && match.winnerId === match.team2Id);
  if (match.tiebreakScore != null && ((match.score1 === 7 && match.score2 === 6) || (match.score1 === 6 && match.score2 === 7))) {
    return won ? `${myScore}-${oppScore}(${match.tiebreakScore})` : `(${match.tiebreakScore})${myScore}-${oppScore}`;
  }
  return `${myScore}-${oppScore}`;
}

export interface LeagueJpegOptions {
  league: MixedLeague;
  leagueMatches: LeagueMatchScore[];
  standings: LeagueStanding[];
  tournamentName: string;
}

/**
 * リーグ表をCanvasに描画してdataURLを返す (プレビュー用)
 */
export function renderLeagueTableToCanvas(opts: LeagueJpegOptions): HTMLCanvasElement {
  const { league, leagueMatches, standings, tournamentName } = opts;
  const teams = league.teams;
  const n = teams.length;

  // スコアマトリクス
  const scoreMatrix = new Map<string, LeagueMatchScore>();
  for (const m of leagueMatches) {
    scoreMatrix.set(`${m.team1Id}-${m.team2Id}`, m);
    scoreMatrix.set(`${m.team2Id}-${m.team1Id}`, m);
  }

  // レイアウト定数
  const SCALE = 2;
  const NUM_W = 30;       // 番号列幅
  const NAME_W = 180;     // 選手名列幅
  const AFF_W = 80;       // 所属列幅
  const MATCH_W = 90;     // 対戦セル幅
  const WL_W = 55;        // 勝敗列幅
  const RANK_W = 45;      // 順位列幅

  // 右側の統計列
  const WINS_W = 50;      // 勝数列幅
  const RATE_W = 65;      // 勝率列幅
  const H2H_W = 55;       // 直接対決列幅
  const JUDGE_W = 55;     // 判定列幅
  const RANK2_W = 45;     // 最終順位列幅

  const ROW_H = 55;       // 各行の高さ
  const HDR_H = 30;       // ヘッダー行の高さ
  const TITLE_H = 40;     // タイトル行の高さ
  const MARGIN = 30;

  const leftW = NUM_W + NAME_W + AFF_W;
  const matchW = n * MATCH_W;
  const rightW = WL_W + RANK_W;
  const statsW = WINS_W + RATE_W + H2H_W + JUDGE_W + RANK2_W;
  const GAP = 20; // テーブル間のスペース
  const tableW = leftW + matchW + rightW;
  const totalW = tableW + GAP + statsW;
  const tableH = HDR_H + n * ROW_H;

  const canvasW = MARGIN * 2 + totalW;
  const canvasH = MARGIN + TITLE_H + tableH + MARGIN;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW * SCALE;
  canvas.height = canvasH * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  // 背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.textBaseline = 'middle';

  // タイトル行
  const tableX = MARGIN;
  const titleY = MARGIN;

  // "A リーグ"
  ctx.fillStyle = '#000';
  ctx.font = `bold 22px ${FONT_BASE}`;
  ctx.textAlign = 'left';
  ctx.fillText(`${league.leagueId.trim()}`, tableX + 10, titleY + TITLE_H / 2);
  ctx.font = `bold 14px ${FONT_BASE}`;
  ctx.fillText('リーグ', tableX + 38, titleY + TITLE_H / 2);

  // 大会名 (右側)
  ctx.font = `bold 16px ${FONT_BASE}`;
  ctx.textAlign = 'right';
  ctx.fillText(tournamentName, tableX + totalW - 10, titleY + TITLE_H / 2);

  const tableY = MARGIN + TITLE_H;

  // === 左テーブル + 対戦テーブル + 勝敗・順位 ===
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;

  // 外枠
  ctx.strokeRect(tableX, tableY, tableW, tableH);

  // ヘッダー行区切り
  ctx.beginPath();
  ctx.moveTo(tableX, tableY + HDR_H);
  ctx.lineTo(tableX + tableW, tableY + HDR_H);
  ctx.stroke();

  // 縦線: 番号|選手名|所属
  const colPositions = [
    tableX + NUM_W,
    tableX + NUM_W + NAME_W,
    tableX + leftW,
  ];
  // 対戦列の縦線
  for (let i = 0; i < n; i++) {
    colPositions.push(tableX + leftW + i * MATCH_W);
  }
  // 勝敗|順位の縦線
  colPositions.push(tableX + leftW + matchW);
  colPositions.push(tableX + leftW + matchW + WL_W);

  for (const x of colPositions) {
    ctx.beginPath();
    ctx.moveTo(x, tableY);
    ctx.lineTo(x, tableY + tableH);
    ctx.stroke();
  }

  // ヘッダーテキスト
  ctx.fillStyle = '#000';
  ctx.font = `bold 12px ${FONT_BASE}`;
  ctx.textAlign = 'center';

  // 「選手名」ヘッダー (番号+名前+所属をまたぐ)
  ctx.fillText('選手名', tableX + (leftW) / 2, tableY + HDR_H / 2);

  // 対戦相手ヘッダー (チーム名)
  for (let i = 0; i < n; i++) {
    const cx = tableX + leftW + i * MATCH_W + MATCH_W / 2;
    ctx.fillText(teams[i].teamName, cx, tableY + HDR_H / 2);
  }

  // 勝敗ヘッダー
  ctx.fillText('勝敗', tableX + leftW + matchW + WL_W / 2, tableY + HDR_H / 2);
  // 順位ヘッダー
  ctx.fillText('順位', tableX + leftW + matchW + WL_W + RANK_W / 2, tableY + HDR_H / 2);

  // データ行
  for (let row = 0; row < n; row++) {
    const team = teams[row];
    const standing = standings.find(s => s.teamId === team.teamId);
    const y = tableY + HDR_H + row * ROW_H;

    // 行区切り線
    if (row > 0) {
      ctx.beginPath();
      ctx.moveTo(tableX, y);
      ctx.lineTo(tableX + tableW, y);
      ctx.stroke();
    }

    // 番号
    ctx.fillStyle = '#000';
    ctx.font = `bold 14px ${FONT_BASE}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${row + 1}`, tableX + NUM_W / 2, y + ROW_H / 2);

    // 選手名 (男子・女子)
    ctx.textAlign = 'left';
    ctx.font = `bold 13px ${FONT_BASE}`;
    const nameX = tableX + NUM_W + 8;
    ctx.fillText(team.male.name, nameX, y + ROW_H / 2 - 10);
    ctx.fillText(team.female.name, nameX, y + ROW_H / 2 + 10);

    // 所属
    ctx.font = `11px ${FONT_BASE}`;
    ctx.fillStyle = '#333';
    const affX = tableX + NUM_W + NAME_W + 5;
    ctx.fillText(team.male.affiliation, affX, y + ROW_H / 2 - 10);
    ctx.fillText(team.female.affiliation, affX, y + ROW_H / 2 + 10);

    // 対戦セル
    for (let col = 0; col < n; col++) {
      const cellX = tableX + leftW + col * MATCH_W;
      const cellCX = cellX + MATCH_W / 2;

      if (row === col) {
        // 対角線
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cellX, y);
        ctx.lineTo(cellX + MATCH_W, y + ROW_H);
        ctx.stroke();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
      } else {
        const colTeam = teams[col];
        const match = scoreMatrix.get(`${team.teamId}-${colTeam.teamId}`);
        if (match && match.status === 'finished') {
          const scoreText = formatScoreText(match, team.teamId);
          ctx.fillStyle = '#000';
          ctx.font = `bold 16px ${FONT_BASE}`;
          ctx.textAlign = 'center';
          ctx.fillText(scoreText, cellCX, y + ROW_H / 2);
        }
      }
    }

    // 勝敗
    ctx.fillStyle = '#000';
    ctx.font = `bold 14px ${FONT_BASE}`;
    ctx.textAlign = 'center';
    if (standing) {
      ctx.fillText(`${standing.wins}-${standing.losses}`, tableX + leftW + matchW + WL_W / 2, y + ROW_H / 2);
    }

    // 順位
    if (standing && standing.rank > 0) {
      ctx.font = `bold 16px ${FONT_BASE}`;
      ctx.fillText(`${standing.rank}位`, tableX + leftW + matchW + WL_W + RANK_W / 2, y + ROW_H / 2);
    }
  }

  // === 右側の統計テーブル ===
  const statsX = tableX + tableW + GAP;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(statsX, tableY, statsW, tableH);

  // ヘッダー
  ctx.beginPath();
  ctx.moveTo(statsX, tableY + HDR_H);
  ctx.lineTo(statsX + statsW, tableY + HDR_H);
  ctx.stroke();

  // 統計列の縦線
  const statsColX = [
    statsX + WINS_W,
    statsX + WINS_W + RATE_W,
    statsX + WINS_W + RATE_W + H2H_W,
    statsX + WINS_W + RATE_W + H2H_W + JUDGE_W,
  ];
  for (const x of statsColX) {
    ctx.beginPath();
    ctx.moveTo(x, tableY);
    ctx.lineTo(x, tableY + tableH);
    ctx.stroke();
  }

  // 統計ヘッダーテキスト
  ctx.fillStyle = '#000';
  ctx.font = `bold 11px ${FONT_BASE}`;
  ctx.textAlign = 'center';
  ctx.fillText('勝数', statsX + WINS_W / 2, tableY + HDR_H / 2);
  ctx.fillText('勝率', statsX + WINS_W + RATE_W / 2, tableY + HDR_H / 2);
  ctx.fillText('直接対決', statsX + WINS_W + RATE_W + H2H_W / 2, tableY + HDR_H / 2);
  ctx.fillText('判定', statsX + WINS_W + RATE_W + H2H_W + JUDGE_W / 2, tableY + HDR_H / 2);
  ctx.fillText('順位', statsX + WINS_W + RATE_W + H2H_W + JUDGE_W + RANK2_W / 2, tableY + HDR_H / 2);

  // 統計データ行
  for (let row = 0; row < n; row++) {
    const team = teams[row];
    const standing = standings.find(s => s.teamId === team.teamId);
    const y = tableY + HDR_H + row * ROW_H;

    if (row > 0) {
      ctx.beginPath();
      ctx.moveTo(statsX, y);
      ctx.lineTo(statsX + statsW, y);
      ctx.stroke();
    }

    if (!standing) continue;

    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';

    // 勝数
    ctx.font = `bold 16px ${FONT_BASE}`;
    ctx.fillText(`${standing.wins}`, statsX + WINS_W / 2, y + ROW_H / 2);

    // 勝率 (ゲーム取得率: gamesWon/totalGames)
    const totalGames = standing.gamesWon + standing.gamesLost;
    const winRate = totalGames > 0 ? standing.gamesWon / totalGames : 0;
    ctx.font = `12px ${FONT_BASE}`;
    const rateStr = `${standing.gamesWon}/${totalGames}\n${winRate.toFixed(3)}`;
    ctx.fillText(`${standing.gamesWon}/${totalGames}`, statsX + WINS_W + RATE_W / 2, y + ROW_H / 2 - 8);
    ctx.fillText(winRate.toFixed(3), statsX + WINS_W + RATE_W / 2, y + ROW_H / 2 + 8);

    // 直接対決
    ctx.font = `bold 14px ${FONT_BASE}`;
    const h2h = standing.headToHeadWin;
    ctx.fillText(`${h2h}`, statsX + WINS_W + RATE_W + H2H_W / 2, y + ROW_H / 2);

    // 判定 (ゲーム率)
    const gameRatio = standing.gamesLost === 0
      ? (standing.gamesWon > 0 ? '∞' : '-')
      : (standing.gamesWon / standing.gamesLost).toFixed(3);
    ctx.font = `12px ${FONT_BASE}`;
    ctx.fillText(gameRatio, statsX + WINS_W + RATE_W + H2H_W + JUDGE_W / 2, y + ROW_H / 2);

    // 最終順位
    ctx.font = `bold 16px ${FONT_BASE}`;
    if (standing.rank > 0) {
      ctx.fillText(`${standing.rank}位`, statsX + WINS_W + RATE_W + H2H_W + JUDGE_W + RANK2_W / 2, y + ROW_H / 2);
    }
  }

  return canvas;
}

/**
 * リーグ表のCanvasをJPEGとしてダウンロード
 */
export function downloadLeagueTableAsJpeg(canvas: HTMLCanvasElement, leagueId: string, tournamentName: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tournamentName}_${leagueId.trim()}リーグ結果.jpg`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/jpeg', 0.95);
}

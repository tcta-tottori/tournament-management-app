import React from 'react';
import { Trophy } from 'lucide-react';
import type { DrawSlotData, MatchResult } from '../draw/DrawBoard';

/** 経過時間を H:MM 形式 */
function formatElapsed(startedAt: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

function getRoundName(round: number, totalRounds: number): string {
  if (round === totalRounds) return '決勝';
  if (round === totalRounds - 1) return '準決勝';
  if (round === totalRounds - 2) return '準々決勝';
  return `${round}回戦`;
}

interface CourtBracketViewProps {
  slots: DrawSlotData[];
  drawSize: number;
  matchResults: MatchResult[];
  eventType?: 'Singles' | 'Doubles' | 'Team';
  totalRounds: number;
  /** 試合ノードのクリックでスコア入力を開く（指定時のみクリック可能） */
  onMatchSelect?: (round: number, position: number) => void;
}

const SLOT_HEIGHT = 36;
const Y_SPACING = 64;
const OFFSET_Y = 40;
// vs表示（両者確定）のカードは氏名＋所属を上下2段で表示するため背が高い。
// コート番号を左側に大きく表示し、氏名・所属も読みやすい大きさにするため背を高くする。
const CARD_H_VS = 66;

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isMobile;
}

export default function CourtBracketView({
  slots,
  drawSize,
  matchResults,
  eventType,
  totalRounds,
  onMatchSelect,
}: CourtBracketViewProps) {
  const isMobile = useIsMobile();
  const isDoubles = eventType === 'Doubles';
  // 所属を省略せず表示しつつ、幅は最適化（広すぎない）
  const slotW = isDoubles ? (isMobile ? 220 : 285) : (isMobile ? 185 : 205);
  const xSpacing = isMobile ? 56 : 78;
  const offsetX = isMobile ? 10 : 20;
  const roundsCount = Math.log2(drawSize);
  const halfSize = drawSize / 2;

  const findMatch = (round: number, position: number): MatchResult | undefined =>
    matchResults.find(m => m.round === round && m.position === position);

  const getWinnerName = (match: MatchResult): string => {
    if (!match.winnerEntryId) return '';
    if (match.winnerEntryId === match.player1EntryId) return match.player1Name;
    if (match.winnerEntryId === match.player2EntryId) return match.player2Name;
    return '';
  };

  const isSlotBye = (i: number) => {
    const s = slots[i];
    return !s || s.isBye || !s.entryId;
  };

  // --- コンパクトY位置 ---
  const r0Y: number[] = new Array(drawSize).fill(0);
  let nextCompactY = OFFSET_Y;
  for (let matchIdx = 0; matchIdx < drawSize / 2; matchIdx++) {
    const topIdx = matchIdx * 2;
    const botIdx = matchIdx * 2 + 1;
    const topBye = isSlotBye(topIdx);
    const botBye = isSlotBye(botIdx);

    if (matchIdx === halfSize / 2 && nextCompactY > OFFSET_Y) {
      nextCompactY += Y_SPACING * 0.8;
    }

    if (topBye && botBye) {
      r0Y[topIdx] = nextCompactY;
      r0Y[botIdx] = nextCompactY;
    } else if (topBye) {
      r0Y[topIdx] = nextCompactY;
      r0Y[botIdx] = nextCompactY;
      nextCompactY += Y_SPACING;
    } else if (botBye) {
      r0Y[topIdx] = nextCompactY;
      r0Y[botIdx] = nextCompactY;
      nextCompactY += Y_SPACING;
    } else {
      r0Y[topIdx] = nextCompactY;
      r0Y[botIdx] = nextCompactY + Y_SPACING;
      nextCompactY += Y_SPACING * 2;
    }
  }

  const getCompactY = (r: number, i: number): number => {
    if (r === 0) return r0Y[i];
    return (getCompactY(r - 1, i * 2) + getCompactY(r - 1, i * 2 + 1)) / 2;
  };
  const getX = (r: number) => offsetX + r * (slotW + xSpacing);

  const containerWidth = offsetX * 2 + roundsCount * (slotW + xSpacing) + slotW;
  const containerHeight = nextCompactY + SLOT_HEIGHT + OFFSET_Y;

  // entryId → ドロー情報（番号・氏名・所属）。全選手は1回戦スロットに存在するので
  // 2回戦以降でも entryId から氏名・所属を引ける。
  const entryInfo = new Map<string, { number: number; name: string; affiliation: string }>();
  {
    let vi = 0;
    for (let i = 0; i < drawSize; i++) {
      const s = slots[i];
      if (!s || (s.isBye && !s.entryId)) continue;
      vi++;
      if (s.entryId) {
        entryInfo.set(s.entryId, { number: vi, name: s.name, affiliation: s.affiliation });
      }
    }
  }
  // 「番号 フルネーム」形式（苗字に省略しない）
  const numberedFullName = (entryId: string | null, fullName: string): string => {
    const info = entryId ? entryInfo.get(entryId) : undefined;
    const n = info?.number;
    const name = fullName || info?.name || '';
    return `${n ? n + ' ' : ''}${name}`;
  };
  const affiliationOf = (entryId: string | null): string =>
    (entryId ? entryInfo.get(entryId)?.affiliation : '') || '';

  // --- 回戦ヘッダー ---
  const roundHeaders: React.ReactNode[] = [];
  for (let r = 0; r <= roundsCount; r++) {
    const x = getX(r);
    // 決勝の次の列（優勝者列）は「N回戦」ではなく「優勝」にする
    const displayLabel = r === 0 ? '1回戦' : r === roundsCount ? '優勝' : getRoundName(r + 1, totalRounds);
    roundHeaders.push(
      <div
        key={`rh-${r}`}
        className="absolute text-[10px] font-bold text-gray-500 text-center"
        style={{ left: x, top: 8, width: slotW }}
      >
        {displayLabel}
      </div>
    );
  }

  // --- SVGパス ---
  const paths: React.ReactNode[] = [];
  for (let r = 0; r < roundsCount; r++) {
    const numMatches = drawSize / Math.pow(2, r + 1);
    for (let m = 0; m < numMatches; m++) {
      const x = getX(r) + slotW;
      const xNext = getX(r + 1);
      const xMid = (x + xNext) / 2;

      const yTop = getCompactY(r, m * 2) + SLOT_HEIGHT / 2;
      const yBottom = getCompactY(r, m * 2 + 1) + SLOT_HEIGHT / 2;
      const yMid = getCompactY(r + 1, m) + SLOT_HEIGHT / 2;

      if (r === 0) {
        const topBye = isSlotBye(m * 2);
        const botBye = isSlotBye(m * 2 + 1);
        if (topBye && botBye) continue;
        if (topBye || botBye) {
          const playerY = topBye ? yBottom : yTop;
          paths.push(
            <path key={`r${r}-m${m}-bye`} d={`M ${x} ${playerY} L ${xNext} ${playerY}`}
              fill="none" stroke="#94a3b8" strokeWidth="1" />
          );
          continue;
        }
      }

      const matchResult = findMatch(r + 1, m + 1);
      const isFinished = matchResult && (matchResult.status === 'finished' || matchResult.status === 'walkover');
      const isPlaying = matchResult?.status === 'playing';
      const winnerIsTop = isFinished && matchResult.winnerEntryId === matchResult.player1EntryId;
      const winnerIsBottom = isFinished && matchResult.winnerEntryId === matchResult.player2EntryId;

      // 勝者の線は緑（従来は赤）。線自体は点滅させない（点滅はカードのみ）。
      const getStroke = (isWinner: boolean) => isWinner ? '#16a34a' : isPlaying ? '#22c55e' : '#94a3b8';
      const getWidth = (isWinner: boolean) => isWinner ? '2.5' : isPlaying ? '2' : '1';

      // 角に丸みを持たせたパスを生成（横→縦のエルボーを二次ベジェで滑らかに）。
      const roundedElbow = (startX: number, y: number, midX: number, endY: number) => {
        const dir = endY > y ? 1 : -1;
        const R = Math.min(9, Math.abs(endY - y) / 2, Math.abs(midX - startX));
        return `M ${startX} ${y} L ${midX - R} ${y} Q ${midX} ${y} ${midX} ${y + dir * R} L ${midX} ${endY}`;
      };

      paths.push(<path key={`r${r}-m${m}-top`} d={roundedElbow(x, yTop, xMid, yMid)}
        fill="none" stroke={getStroke(!!winnerIsTop)} strokeWidth={getWidth(!!winnerIsTop)}
        strokeLinecap="round" strokeLinejoin="round" />);
      paths.push(<path key={`r${r}-m${m}-bot`} d={roundedElbow(x, yBottom, xMid, yMid)}
        fill="none" stroke={getStroke(!!winnerIsBottom)} strokeWidth={getWidth(!!winnerIsBottom)}
        strokeLinecap="round" strokeLinejoin="round" />);

      const winnerExists = winnerIsTop || winnerIsBottom;
      paths.push(<path key={`r${r}-m${m}-conn`} d={`M ${xMid} ${yMid} L ${xNext} ${yMid}`}
        fill="none" stroke={winnerExists ? '#16a34a' : isPlaying ? '#22c55e' : '#94a3b8'}
        strokeWidth={winnerExists ? '2.5' : '1'} strokeLinecap="round" />);

      // 結果（スコア）を線が合流する付近に上下に並べて表示（手書きスケッチ準拠）。
      // 上側=player1のスコアは合流点の上、下側=player2のスコアは下に配置。勝者側は緑ピル。
      if (isFinished && matchResult.score) {
        const raw = matchResult.score.trim();
        const nums = raw.match(/^(\d+)\s*-\s*(\d+)/);
        const scoreX = (xMid + xNext) / 2; // 合流後の横線の中央付近
        if (nums) {
          const topWin = !!winnerIsTop;
          const botWin = !!winnerIsBottom;
          const pill = (key: string, cx: number, cy: number, val: string, win: boolean) => {
            const w = 20, h = 16;
            return (
              <g key={key}>
                <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={7}
                  fill={win ? '#16a34a' : '#ffffff'} stroke={win ? '#16a34a' : '#cbd5e1'} strokeWidth="1" />
                <text x={cx} y={cy + 4.5} fill={win ? '#ffffff' : '#64748b'}
                  fontSize="13" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  {val}
                </text>
              </g>
            );
          };
          // 合流点(yMid)を挟んで上に上側選手のスコア、下に下側選手のスコア
          paths.push(pill(`sT-${r}-${m}`, scoreX, yMid - 11, nums[1], topWin));
          paths.push(pill(`sB-${r}-${m}`, scoreX, yMid + 11, nums[2], botWin));
        } else {
          // Ret / W.O 等は敗者側の横線上に表示（対象の人側に記載）。
          const loserY = winnerIsTop ? yBottom : yTop; // 勝者でない側
          const loserFeederMidX = (x + xMid) / 2;
          const w = Math.max(26, raw.length * 7 + 10);
          paths.push(
            <g key={`sX-${r}-${m}`}>
              <rect x={loserFeederMidX - w / 2} y={loserY - 8} width={w} height={16} rx={7}
                fill="#ffffff" stroke="#f87171" strokeWidth="1" />
              <text x={loserFeederMidX} y={loserY + 4} fill="#dc2626"
                fontSize="10" fontWeight="bold" textAnchor="middle">
                {raw}
              </text>
            </g>
          );
        }
      }

      // 対戦カード下部の時間表示。試合中は経過時間のみ（開始時刻は出さない）、
      // それ以外は開始時刻(予定)を表示する。カード高さ（vsは背高）に合わせて位置調整。
      const nextBothPlayers = !!(matchResult?.player1Name && matchResult?.player2Name);
      const nextIsVs = nextBothPlayers && !isFinished;
      const nextCardH = nextIsVs ? CARD_H_VS : SLOT_HEIGHT;
      const cardCenterX = xNext + slotW / 2;
      const cardBottomY = getCompactY(r + 1, m) + (SLOT_HEIGHT + nextCardH) / 2 + 10;
      // 開始時刻（scheduledTime）はドロー表には既定で表示しない（「9:00」等の既定値を出さない）。
      // 試合中のみ経過時間を表示する。
      const bottomText = isPlaying
        ? (matchResult?.updatedAt ? formatElapsed(matchResult.updatedAt) : '')
        : '';
      if (bottomText) {
        paths.push(
          <text key={`bt-${r}-${m}`} x={cardCenterX} y={cardBottomY}
            fill={isPlaying ? '#16a34a' : '#1e40af'}
            fontSize="8.5" fontWeight="bold" textAnchor="middle">
            {bottomText}
          </text>
        );
      }
    }
  }

  // --- 1回戦スロット ---
  const slotElements: React.ReactNode[] = [];
  let visibleIndex = 0;
  for (let i = 0; i < drawSize; i++) {
    const slot = slots[i];
    if (!slot || (slot.isBye && !slot.entryId)) continue;
    visibleIndex++;
    const x = getX(0);
    const y = r0Y[i];

    slotElements.push(
      <div key={`s-${slot.position}`}
        className="absolute flex items-center px-1.5 gap-1 bg-white border border-gray-400 rounded select-none"
        style={{ left: x, top: y, width: slotW, height: SLOT_HEIGHT }}
      >
        <div className="w-5 text-[10px] font-mono font-bold text-gray-600 border-r border-gray-300 pr-1 text-center shrink-0">
          {visibleIndex}
        </div>
        {slot.seed > 0 && (
          <div className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center bg-amber-100 text-amber-700 text-[8px] font-bold rounded-full">
            {slot.seed}
          </div>
        )}
        <div className="flex-1 truncate font-semibold text-gray-900 text-[13px]" title={slot.name}>
          {slot.isBye ? <span className="text-gray-400">BYE</span> : slot.name}
        </div>
        {!slot.isBye && slot.affiliation && (
          <div className="text-[10px] text-gray-500 whitespace-nowrap shrink-0" title={slot.affiliation}>
            {slot.affiliation}
          </div>
        )}
      </div>
    );
  }

  // 対戦カード（vs）用の選手1行：番号＋フルネーム、所属は下段（改行）に表示。
  // 氏名・所属は読みやすいよう十分な大きさで表示する。
  const playerRow = (entryId: string | null, name: string, key: string, dim: boolean) => {
    const full = numberedFullName(entryId, name);
    const aff = affiliationOf(entryId);
    return (
      <div key={key} className="min-w-0 leading-tight">
        <div className={`text-[13px] font-bold truncate ${dim ? 'text-gray-600' : 'text-gray-900'}`} title={full}>
          {full || '—'}
        </div>
        {aff && <div className="text-[10px] text-gray-500 truncate" title={aff}>{aff}</div>}
      </div>
    );
  };
  // コート番号を大きく表示する左側ブロック（カード左端・全高）。
  const courtColumn = (court: string, tone: 'playing' | 'ready' | 'idle') => {
    const num = (court || '').replace(/[^0-9]/g, '') || court;
    if (!num) return null;
    const bg = tone === 'playing' ? 'bg-green-600' : tone === 'ready' ? 'bg-blue-600' : 'bg-gray-400';
    return (
      <div className={`flex flex-col items-center justify-center shrink-0 text-white ${bg}`} style={{ width: 42 }}>
        <span className="text-[8px] font-bold leading-none opacity-85">コート</span>
        <span className="text-2xl font-black leading-none mt-0.5">{num}</span>
      </div>
    );
  };

  // --- 2回戦以降のマッチノード ---
  const matchElements: React.ReactNode[] = [];
  for (let r = 1; r <= roundsCount; r++) {
    const numNodes = drawSize / Math.pow(2, r);
    for (let m = 0; m < numNodes; m++) {
      const x = getX(r);
      const y = getCompactY(r, m);
      const matchResult = findMatch(r, m + 1);
      const isFinished = matchResult && (matchResult.status === 'finished' || matchResult.status === 'walkover');
      const isPlaying = matchResult?.status === 'playing';
      const isReady = matchResult?.status === 'ready';
      const isFinal = r === roundsCount;
      const bothPlayers = !!(matchResult?.player1Name && matchResult?.player2Name);
      const isVs = bothPlayers && !isFinished; // 両者確定・未確定 → vs 表示（背高カード）

      // カード高さ：vs表示のみ氏名＋所属を2段で見せるため背を高くし、
      // 取り付き位置（中心）は SLOT_HEIGHT 基準の合流点に合わせる。
      const cardH = isVs ? CARD_H_VS : SLOT_HEIGHT;
      const top = y + (SLOT_HEIGHT - cardH) / 2;

      // このノードがクリックでスコア入力できるか（両選手が確定している場合のみ）
      const clickable = !!(onMatchSelect && bothPlayers);
      const clickProps = clickable
        ? { onClick: () => onMatchSelect!(matchResult!.round, matchResult!.position), role: 'button' as const }
        : {};
      const clickCls = clickable ? ' cursor-pointer hover:ring-2 hover:ring-emerald-400' : '';

      // 枠の配色（点滅は枠のみ・カード内はそのまま = bracket-card-blink）
      const cardClass = isFinished
        ? (isFinal ? 'border-2 border-amber-500 bg-amber-50' : 'border border-gray-400 bg-white')
        : isPlaying
          ? 'border-2 border-green-500 bg-green-50 bracket-card-blink'
          : isReady
            ? 'border border-blue-400 bg-blue-50'
            : isVs
              ? 'border border-gray-300 bg-white'
              : `border border-dashed ${isFinal ? 'border-gray-400' : 'border-gray-300'} bg-white`;

      let content: React.ReactNode;
      if (isFinished) {
        // 勝者：番号＋フルネーム＋所属（1行）
        const winnerFull = numberedFullName(matchResult.winnerEntryId, getWinnerName(matchResult));
        const winnerAff = affiliationOf(matchResult.winnerEntryId);
        content = (
          <div className="flex items-center gap-1 w-full min-w-0 px-2">
            {isFinal && <Trophy className="w-4 h-4 text-yellow-500 shrink-0" />}
            <span className={`truncate flex-1 ${isFinal ? 'text-[13px] font-bold text-primary-700' : 'text-[12px] font-semibold text-gray-800'}`} title={winnerFull}>
              {winnerFull}
            </span>
            {winnerAff && (
              <span className="text-[10px] text-gray-500 whitespace-nowrap shrink-0">{winnerAff}</span>
            )}
          </div>
        );
      } else if (isVs) {
        // vs表示：左端にコート番号を大きく表示し、右側に両選手を上下2段（氏名＋所属）で表示
        const dim = !isPlaying && !isReady;
        const tone: 'playing' | 'ready' | 'idle' = isPlaying ? 'playing' : isReady ? 'ready' : 'idle';
        content = (
          <div className="flex items-stretch w-full h-full min-w-0">
            {courtColumn(matchResult!.courtName, tone)}
            <div className="flex-1 flex flex-col justify-center min-w-0 px-2 gap-0.5">
              {playerRow(matchResult!.player1EntryId, matchResult!.player1Name, 'p1', dim)}
              <div className="border-t border-gray-200" />
              {playerRow(matchResult!.player2EntryId, matchResult!.player2Name, 'p2', dim)}
            </div>
          </div>
        );
      } else {
        // 選手未確定
        content = (
          <div className="flex items-center gap-1 w-full min-w-0 px-2">
            {isFinal ? (
              <>
                <Trophy className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                <span className="text-[11px] text-gray-400 font-bold">決勝</span>
              </>
            ) : (
              <span className="text-[11px] text-gray-400 truncate flex-1">&nbsp;</span>
            )}
          </div>
        );
      }

      matchElements.push(
        <div key={`m-${r}-${m}`}
          {...clickProps}
          className={`absolute flex items-center overflow-hidden rounded transition-all${clickCls} ${cardClass}`}
          style={{ left: x, top, width: slotW, height: cardH }}
        >
          {content}
        </div>
      );
    }
  }

  return (
    <div className="relative overflow-auto" style={{ width: '100%', height: '100%' }}>
      <div className="relative" style={{ width: containerWidth, height: containerHeight, minHeight: '100%' }}>
        {/* 回戦ヘッダー */}
        {roundHeaders}

        {/* SVGライン + スコア + コートタイル */}
        <svg className="absolute inset-0 pointer-events-none" width={containerWidth} height={containerHeight}>
          {paths}
        </svg>

        {/* 選手スロット */}
        {slotElements}

        {/* 対戦ノード */}
        {matchElements}
      </div>
    </div>
  );
}

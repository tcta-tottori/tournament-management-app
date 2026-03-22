import React from 'react';
import { Trophy, Timer } from 'lucide-react';
import type { DrawSlotData, MatchResult } from '../draw/DrawBoard';

/** フルネームから苗字を抽出 */
function getSurname(name: string): string {
  if (!name) return '';
  if (name.includes('/') || name.includes('／')) {
    return name.split(/[/／]/).map(n => getSurname(n.trim())).join('/');
  }
  const parts = name.trim().split(/\s+/);
  return parts[0] || name;
}

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
}

const SLOT_HEIGHT = 36;
const Y_SPACING = 44;
const OFFSET_Y = 40;

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
}: CourtBracketViewProps) {
  const isMobile = useIsMobile();
  const isDoubles = eventType === 'Doubles';
  const slotW = isDoubles ? (isMobile ? 200 : 260) : (isMobile ? 150 : 190);
  const xSpacing = isMobile ? 36 : 50;
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

  // --- 回戦ヘッダー ---
  const roundHeaders: React.ReactNode[] = [];
  for (let r = 0; r <= roundsCount; r++) {
    const x = getX(r);
    const displayLabel = r === 0 ? '1回戦' : getRoundName(r + 1, totalRounds);
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

      const getStroke = (isWinner: boolean) => isWinner ? '#dc2626' : isPlaying ? '#16a34a' : '#94a3b8';
      const getWidth = (isWinner: boolean) => isWinner ? '2.5' : isPlaying ? '2' : '1';

      paths.push(<path key={`r${r}-m${m}-top`} d={`M ${x} ${yTop} L ${xMid} ${yTop} L ${xMid} ${yMid}`}
        fill="none" stroke={getStroke(!!winnerIsTop)} strokeWidth={getWidth(!!winnerIsTop)} />);
      paths.push(<path key={`r${r}-m${m}-bot`} d={`M ${x} ${yBottom} L ${xMid} ${yBottom} L ${xMid} ${yMid}`}
        fill="none" stroke={getStroke(!!winnerIsBottom)} strokeWidth={getWidth(!!winnerIsBottom)} />);

      const winnerExists = winnerIsTop || winnerIsBottom;
      paths.push(<path key={`r${r}-m${m}-conn`} d={`M ${xMid} ${yMid} L ${xNext} ${yMid}`}
        fill="none" stroke={winnerExists ? '#dc2626' : isPlaying ? '#16a34a' : '#94a3b8'}
        strokeWidth={winnerExists ? '2.5' : '1'} />);

      // スコアを線の上に赤字で表示（完了試合）
      if (isFinished && matchResult.score) {
        const scoreX = xMid + 4;
        const scoreY = yMid - 6;
        paths.push(
          <text key={`sc-${r}-${m}`} x={scoreX} y={scoreY}
            fill="#dc2626" fontSize="9" fontWeight="bold" fontFamily="monospace">
            {matchResult.score}
          </text>
        );
      }

      // コートタイル（試合中の場合、接続線の中間に表示）
      if (isPlaying && matchResult.courtName) {
        const tileX = xMid - 14;
        const tileY = yMid - 20;
        paths.push(
          <React.Fragment key={`ct-${r}-${m}`}>
            <rect x={tileX} y={tileY} width="28" height="16" rx="3"
              fill="#1d4ed8" stroke="#1e40af" strokeWidth="1" />
            <text x={tileX + 14} y={tileY + 12} textAnchor="middle"
              fill="white" fontSize="10" fontWeight="bold">
              {matchResult.courtName}
            </text>
          </React.Fragment>
        );
      }

      // 時間表示（1回戦のみ、scheduled time）
      if (r === 0 && matchResult?.scheduledTime) {
        const timeX = xMid - 2;
        const timeY = yMid + 14;
        paths.push(
          <text key={`tm-${r}-${m}`} x={timeX} y={timeY}
            fill="#1e40af" fontSize="8" fontWeight="bold" textAnchor="middle">
            {matchResult.scheduledTime}
          </text>
        );
      }

      // 経過時間（試合中）
      if (isPlaying && matchResult.updatedAt) {
        const elX = xMid;
        const elY = yMid + 14;
        paths.push(
          <text key={`el-${r}-${m}`} x={elX} y={elY}
            fill="#16a34a" fontSize="8" fontWeight="bold" textAnchor="middle">
            {formatElapsed(matchResult.updatedAt)}
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
        <div className="flex-1 truncate font-medium text-gray-900 text-[11px]" title={slot.name}>
          {slot.isBye ? <span className="text-gray-400">BYE</span> : slot.name}
        </div>
        {!slot.isBye && slot.affiliation && (
          <div className="text-[9px] text-gray-500 truncate max-w-[40px] shrink-0" title={slot.affiliation}>
            {slot.affiliation}
          </div>
        )}
      </div>
    );
  }

  // --- 2回戦以降のマッチノード ---
  const matchElements: React.ReactNode[] = [];
  for (let r = 1; r <= roundsCount; r++) {
    const numNodes = drawSize / Math.pow(2, r);
    for (let m = 0; m < numNodes; m++) {
      const x = getX(r);
      const y = getCompactY(r, m);
      const matchResult = findMatch(r, m + 1);
      const winnerName = matchResult ? getWinnerName(matchResult) : '';
      const isFinished = matchResult && (matchResult.status === 'finished' || matchResult.status === 'walkover');
      const isPlaying = matchResult?.status === 'playing';

      // 決勝ラウンド
      if (r === roundsCount) {
        const displayName = matchResult ? getWinnerName(matchResult) : '';

        matchElements.push(
          <div key={`f-${r}-${m}`}
            className={`absolute flex items-center rounded transition-all ${
              isFinished
                ? 'border-2 border-amber-500 bg-amber-50'
                : isPlaying
                  ? 'border-2 border-green-500 bg-green-50 animate-pulse'
                  : 'border border-dashed border-gray-400 bg-white'
            }`}
            style={{ left: x, top: y, width: slotW, height: SLOT_HEIGHT }}
          >
            <div className="flex items-center gap-1 w-full min-w-0 px-2">
              {isFinished ? (
                <>
                  <Trophy className="w-4 h-4 text-yellow-500 shrink-0" />
                  <span className="text-sm font-bold text-primary-700 truncate">{displayName}</span>
                  {matchResult.score && (
                    <span className="text-[9px] text-red-600 font-bold font-mono ml-auto shrink-0">
                      {matchResult.score}
                    </span>
                  )}
                </>
              ) : isPlaying ? (
                <>
                  <span className="text-[11px] font-medium text-gray-800 truncate flex-1">
                    {matchResult.player1Name && matchResult.player2Name
                      ? `${getSurname(matchResult.player1Name)} vs ${getSurname(matchResult.player2Name)}`
                      : '決勝'}
                  </span>
                  {matchResult.courtName && (
                    <span className="bg-blue-700 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0">
                      {matchResult.courtName}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <Trophy className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                  <span className="text-[11px] text-gray-400 font-bold">決勝</span>
                </>
              )}
            </div>
          </div>
        );
        continue;
      }

      // 通常ノード
      matchElements.push(
        <div key={`m-${r}-${m}`}
          className={`absolute flex items-center rounded transition-all ${
            isFinished
              ? 'border border-gray-400 bg-white'
              : isPlaying
                ? 'border-2 border-green-500 bg-green-50'
                : matchResult?.status === 'ready'
                  ? 'border border-blue-400 bg-blue-50'
                  : 'border border-dashed border-gray-300 bg-white'
          }`}
          style={{ left: x, top: y, width: slotW, height: SLOT_HEIGHT }}
        >
          <div className="flex items-center gap-1 w-full min-w-0 px-2">
            {isFinished ? (
              <>
                <span className="text-[11px] font-medium text-gray-800 truncate flex-1" title={winnerName}>
                  {winnerName}
                </span>
                {matchResult.score && (
                  <span className="text-[9px] text-red-600 font-bold font-mono shrink-0">
                    {matchResult.score}
                  </span>
                )}
              </>
            ) : isPlaying ? (
              <>
                <span className="text-[11px] font-medium text-gray-800 truncate flex-1">
                  {matchResult.player1Name && matchResult.player2Name
                    ? `${getSurname(matchResult.player1Name)} vs ${getSurname(matchResult.player2Name)}`
                    : ''}
                </span>
                {matchResult.courtName && (
                  <span className="bg-blue-700 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0">
                    {matchResult.courtName}
                  </span>
                )}
                {matchResult.updatedAt && (
                  <span className="text-[8px] text-green-700 font-bold shrink-0 flex items-center gap-0.5">
                    <Timer className="w-2.5 h-2.5" />
                    {formatElapsed(matchResult.updatedAt)}
                  </span>
                )}
              </>
            ) : matchResult?.status === 'ready' ? (
              <>
                <span className="text-[11px] text-gray-700 truncate flex-1">
                  {matchResult.player1Name && matchResult.player2Name
                    ? `${getSurname(matchResult.player1Name)} vs ${getSurname(matchResult.player2Name)}`
                    : ''}
                </span>
                {matchResult.courtName && (
                  <span className="bg-blue-700 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0">
                    {matchResult.courtName}
                  </span>
                )}
                {matchResult.scheduledTime && matchResult.round === 1 && (
                  <span className="text-[8px] text-blue-700 font-bold shrink-0">{matchResult.scheduledTime}</span>
                )}
              </>
            ) : (
              <span className="text-[11px] text-gray-400 truncate flex-1">
                {matchResult?.player1Name && matchResult?.player2Name
                  ? `${getSurname(matchResult.player1Name)} vs ${getSurname(matchResult.player2Name)}`
                  : ''}
              </span>
            )}
          </div>
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

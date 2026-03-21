import React from 'react';
import { Trophy, Timer } from 'lucide-react';
import type { DrawSlotData, MatchResult } from '../../features/draw/DrawBoard';

/** フルネームから苗字を抽出 */
function getSurname(name: string): string {
  if (!name) return '';
  if (name.includes('/') || name.includes('／')) {
    return name.split(/[/／]/).map(n => getSurname(n.trim())).join('/');
  }
  const parts = name.trim().split(/\s+/);
  return parts[0] || name;
}

/** 経過時間を H:MM 形式で返す */
function formatElapsed(startedAt: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

interface ScoreboardBracketProps {
  slots: DrawSlotData[];
  drawSize: number;
  matchResults: MatchResult[];
  eventType?: 'Singles' | 'Doubles' | 'Team';
  selectedMatchId?: string | null;
  onMatchSelect: (round: number, position: number) => void;
}

const SLOT_HEIGHT = 40;
const SLOT_WIDTH = 200;
const SLOT_WIDTH_MOBILE = 160;
const Y_SPACING = 48;
const X_SPACING = 60;
const X_SPACING_MOBILE = 40;
const OFFSET_X = 24;
const OFFSET_X_MOBILE = 12;
const OFFSET_Y = 32;

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

export default function ScoreboardBracket({
  slots,
  drawSize,
  matchResults,
  eventType,
  selectedMatchId,
  onMatchSelect,
}: ScoreboardBracketProps) {
  const isMobile = useIsMobile();
  const isDoubles = eventType === 'Doubles';
  const slotW = isDoubles ? (isMobile ? 220 : 280) : (isMobile ? SLOT_WIDTH_MOBILE : SLOT_WIDTH);
  const xSpacing = isMobile ? X_SPACING_MOBILE : X_SPACING;
  const offsetX = isMobile ? OFFSET_X_MOBILE : OFFSET_X;
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

  const isMatchSelected = (round: number, position: number): boolean =>
    selectedMatchId === `${round}-${position}`;

  // BYE判定
  const isSlotBye = (i: number) => {
    const s = slots[i];
    return !s || s.isBye || !s.entryId;
  };

  // --- コンパクトY位置（BYEペアを詰める） ---
  const r0Y: number[] = new Array(drawSize).fill(0);
  let nextCompactY = OFFSET_Y;
  for (let matchIdx = 0; matchIdx < drawSize / 2; matchIdx++) {
    const topIdx = matchIdx * 2;
    const botIdx = matchIdx * 2 + 1;
    const topBye = isSlotBye(topIdx);
    const botBye = isSlotBye(botIdx);

    // 左山/右山の境界にスペース
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
              fill="none" stroke="#cbd5e1" strokeWidth="1.5" />
          );
          continue;
        }
      }

      const matchResult = findMatch(r + 1, m + 1);
      const isFinished = matchResult && (matchResult.status === 'finished' || matchResult.status === 'walkover');
      const isPlaying = matchResult?.status === 'playing';
      const winnerIsTop = isFinished && matchResult.winnerEntryId === matchResult.player1EntryId;
      const winnerIsBottom = isFinished && matchResult.winnerEntryId === matchResult.player2EntryId;

      const getStroke = (isWinner: boolean) => isWinner ? '#dc2626' : isPlaying ? '#16a34a' : '#cbd5e1';
      const getWidth = (isWinner: boolean) => isWinner ? '2.5' : isPlaying ? '2' : '1.5';

      paths.push(<path key={`r${r}-m${m}-top`} d={`M ${x} ${yTop} L ${xMid} ${yTop} L ${xMid} ${yMid}`}
        fill="none" stroke={getStroke(!!winnerIsTop)} strokeWidth={getWidth(!!winnerIsTop)} />);
      paths.push(<path key={`r${r}-m${m}-bot`} d={`M ${x} ${yBottom} L ${xMid} ${yBottom} L ${xMid} ${yMid}`}
        fill="none" stroke={getStroke(!!winnerIsBottom)} strokeWidth={getWidth(!!winnerIsBottom)} />);

      const winnerExists = winnerIsTop || winnerIsBottom;
      paths.push(<path key={`r${r}-m${m}-conn`} d={`M ${xMid} ${yMid} L ${xNext} ${yMid}`}
        fill="none" stroke={winnerExists ? '#dc2626' : isPlaying ? '#16a34a' : '#cbd5e1'}
        strokeWidth={winnerExists ? '2.5' : '1.5'} />);
    }
  }

  // --- ステータスバッジ ---
  const renderStatusBadge = (match: MatchResult) => {
    if (match.status === 'ready')
      return <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-700 leading-none">準備完了</span>;
    if (match.status === 'playing')
      return <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-green-100 text-green-700 leading-none animate-pulse">試合中</span>;
    if (match.status === 'walkover')
      return <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-gray-200 text-gray-600 leading-none">W/O</span>;
    return null;
  };

  const getMatchClasses = (match: MatchResult | undefined, selected: boolean): string => {
    const base = 'absolute flex items-center rounded-md transition-all cursor-pointer';
    const ring = selected ? 'ring-2 ring-primary-500 ring-offset-1' : '';
    if (!match || match.status === 'waiting')
      return `${base} border border-dashed border-gray-300 bg-white hover:border-gray-400 hover:shadow ${ring}`;
    if (match.status === 'ready')
      return `${base} border border-blue-400 bg-blue-50 hover:border-blue-500 hover:shadow ${ring}`;
    if (match.status === 'playing')
      return `${base} border-2 border-green-500 bg-green-50 hover:shadow ${ring}`;
    if (match.status === 'finished')
      return `${base} border border-primary-500 bg-white shadow-sm hover:shadow ${ring}`;
    if (match.status === 'walkover')
      return `${base} border border-primary-500 bg-white shadow-sm hover:shadow ${ring}`;
    return `${base} border border-gray-300 bg-white ${ring}`;
  };

  // --- 1回戦スロット ---
  const slotElements: React.ReactNode[] = [];
  let visibleIndex = 0;
  for (let i = 0; i < drawSize; i++) {
    const slot = slots[i];
    if (!slot || (slot.isBye && !slot.entryId)) continue;
    visibleIndex++;
    const x = getX(0);
    const y = r0Y[i];

    const matchIdx = Math.floor(i / 2);
    const r1Match = findMatch(1, matchIdx + 1);
    const pairIdx = i % 2 === 0 ? i + 1 : i - 1;
    const pairSlot = slots[pairIdx];
    const bothFilled = slot.entryId && pairSlot?.entryId && !pairSlot.isBye;
    const isClickable = bothFilled && (!r1Match || r1Match.status === 'waiting');

    slotElements.push(
      <div key={`s-${slot.position}`}
        className={`absolute flex items-center px-2 gap-1.5 bg-white border shadow-sm rounded-md select-none text-sm
          ${slot.isBye ? 'border-dashed border-gray-300 text-gray-400' : 'border-gray-300'}
          ${isClickable ? 'hover:border-primary-400 hover:shadow cursor-pointer' : ''}
        `}
        style={{ left: x, top: y, width: slotW, height: SLOT_HEIGHT }}
        onClick={() => isClickable && onMatchSelect(1, matchIdx + 1)}
      >
        <div className="w-5 text-[10px] font-mono text-gray-400 border-r border-gray-100 pr-1 text-center">{visibleIndex}</div>
        {slot.seed > 0 && (
          <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center bg-amber-100 text-amber-700 text-[9px] font-bold rounded-full">{slot.seed}</div>
        )}
        <div className="flex-1 truncate font-medium text-gray-800 text-xs" title={slot.name}>
          {slot.name}
        </div>
        {!slot.isBye && slot.affiliation && (
          <div className="text-[10px] text-gray-500 truncate max-w-[50px]" title={slot.affiliation}>{slot.affiliation}</div>
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
      const selected = isMatchSelected(r, m + 1);

      // 最終ラウンド = 優勝者表示
      if (r === roundsCount) {
        const finalMatch = findMatch(roundsCount, 1);
        const displayName = finalMatch ? getWinnerName(finalMatch) : '';

        // 決勝の対戦ノード
        matchElements.push(
          <div key={`f-${r}-${m}`}
            className={getMatchClasses(matchResult, selected)}
            style={{ left: x, top: y, width: slotW, height: SLOT_HEIGHT }}
            onClick={() => onMatchSelect(r, m + 1)}
          >
            <div className="flex flex-col justify-center w-full min-w-0 px-2">
              {matchResult && (matchResult.status === 'finished' || matchResult.status === 'walkover') ? (
                <div className="flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                  <span className="text-sm font-bold text-primary-600 truncate">{displayName}</span>
                  {matchResult.score && <span className="text-[9px] text-gray-700 font-bold ml-auto shrink-0">{matchResult.score}</span>}
                </div>
              ) : matchResult && matchResult.status === 'playing' ? (
                <>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-medium text-gray-800 truncate flex-1">
                      {matchResult.player1Name && matchResult.player2Name
                        ? `${getSurname(matchResult.player1Name)} vs ${getSurname(matchResult.player2Name)}`
                        : getSurname(matchResult.player1Name || matchResult.player2Name || '決勝')}
                    </span>
                    {renderStatusBadge(matchResult)}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {matchResult.courtName && <span className="bg-primary-500 text-white text-[8px] font-bold px-1 py-0.5 rounded leading-none">{matchResult.courtName}</span>}
                    {matchResult.updatedAt && <span className="flex items-center gap-0.5 bg-green-700 text-white text-[8px] font-bold px-1 py-0.5 rounded leading-none ml-auto"><Timer className="w-2.5 h-2.5" />{formatElapsed(matchResult.updatedAt)}</span>}
                  </div>
                </>
              ) : matchResult && matchResult.status === 'ready' ? (
                <>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-medium text-gray-800 truncate flex-1">
                      {matchResult.player1Name && matchResult.player2Name
                        ? `${getSurname(matchResult.player1Name)} vs ${getSurname(matchResult.player2Name)}`
                        : getSurname(matchResult.player1Name || matchResult.player2Name || '決勝')}
                    </span>
                    {renderStatusBadge(matchResult)}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {matchResult.courtName && <span className="bg-primary-500 text-white text-[8px] font-bold px-1 py-0.5 rounded leading-none">{matchResult.courtName}</span>}
                    {matchResult.scheduledTime && matchResult.round === 1 && <span className="bg-blue-800 text-white text-[8px] font-bold px-1 py-0.5 rounded leading-none">{matchResult.scheduledTime}</span>}
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                  <span className="text-xs font-bold text-gray-400 tracking-wider">決勝</span>
                </div>
              )}
            </div>
          </div>
        );
        continue;
      }

      // 通常の対戦ノード
      matchElements.push(
        <div key={`m-${r}-${m}`}
          className={getMatchClasses(matchResult, selected)}
          style={{ left: x, top: y, width: slotW, height: SLOT_HEIGHT }}
          onClick={() => onMatchSelect(r, m + 1)}
        >
          <div className="flex flex-col justify-center w-full min-w-0 px-2">
            {matchResult && (matchResult.status === 'finished' || matchResult.status === 'walkover') ? (
              <>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium text-gray-800 truncate flex-1" title={winnerName}>{winnerName}</span>
                  {renderStatusBadge(matchResult)}
                </div>
                {matchResult.score && <div className="text-[9px] text-gray-700 font-bold truncate">{matchResult.score}</div>}
              </>
            ) : matchResult && matchResult.status === 'playing' ? (
              <>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium text-gray-800 truncate flex-1">
                    {matchResult.player1Name && matchResult.player2Name
                      ? `${getSurname(matchResult.player1Name)} vs ${getSurname(matchResult.player2Name)}`
                      : getSurname(matchResult.player1Name || matchResult.player2Name || '')}
                  </span>
                  {renderStatusBadge(matchResult)}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  {matchResult.courtName && <span className="bg-primary-500 text-white text-[8px] font-bold px-1 py-0.5 rounded leading-none">{matchResult.courtName}</span>}
                  {matchResult.updatedAt && <span className="flex items-center gap-0.5 bg-green-700 text-white text-[8px] font-bold px-1 py-0.5 rounded leading-none ml-auto"><Timer className="w-2.5 h-2.5" />{formatElapsed(matchResult.updatedAt)}</span>}
                </div>
              </>
            ) : matchResult && matchResult.status === 'ready' ? (
              <>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium text-gray-800 truncate flex-1">
                    {matchResult.player1Name && matchResult.player2Name
                      ? `${getSurname(matchResult.player1Name)} vs ${getSurname(matchResult.player2Name)}`
                      : getSurname(matchResult.player1Name || matchResult.player2Name || '')}
                  </span>
                  {renderStatusBadge(matchResult)}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  {matchResult.scheduledTime && matchResult.round === 1 && <span className="bg-blue-800 text-white text-[8px] font-bold px-1 py-0.5 rounded leading-none">{matchResult.scheduledTime}</span>}
                  {matchResult.courtName && <span className="bg-primary-500 text-white text-[8px] font-bold px-1 py-0.5 rounded leading-none">{matchResult.courtName}</span>}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between w-full">
                <span className="text-xs text-gray-400 truncate">
                  {matchResult?.player1Name && matchResult?.player2Name
                    ? `${getSurname(matchResult.player1Name)} vs ${getSurname(matchResult.player2Name)}`
                    : getSurname(matchResult?.player1Name || matchResult?.player2Name || '')}
                </span>
                <div className="flex items-center gap-1">
                  {matchResult?.scheduledTime && matchResult.round === 1 && <span className="bg-blue-800 text-white text-[8px] font-bold px-1 py-0.5 rounded leading-none">{matchResult.scheduledTime}</span>}
                  {matchResult?.courtName && <span className="bg-primary-500 text-white text-[8px] font-bold px-1 py-0.5 rounded leading-none">{matchResult.courtName}</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }
  }

  return (
    <div className="relative overflow-auto bg-gray-50/50" style={{ width: '100%', height: '100%' }}>
      <div className="relative" style={{ width: containerWidth, height: containerHeight }}>
        <svg className="absolute inset-0 pointer-events-none" width={containerWidth} height={containerHeight}>
          {paths}
        </svg>
        {slotElements}
        {matchElements}
      </div>
    </div>
  );
}

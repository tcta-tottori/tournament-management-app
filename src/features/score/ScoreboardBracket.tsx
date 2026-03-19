import React from 'react';
import { Trophy } from 'lucide-react';
import type { DrawSlotData, MatchResult } from '../../features/draw/DrawBoard';

interface ScoreboardBracketProps {
  slots: DrawSlotData[];
  drawSize: number;
  matchResults: MatchResult[];
  eventType?: 'Singles' | 'Doubles' | 'Team';
  selectedMatchId?: string | null;
  onMatchSelect: (round: number, position: number) => void;
}

const SLOT_HEIGHT = 44;
const Y_SPACING = 56;
const OFFSET_X = 40;
const OFFSET_Y = 40;

export default function ScoreboardBracket({
  slots,
  drawSize,
  matchResults,
  eventType,
  selectedMatchId,
  onMatchSelect,
}: ScoreboardBracketProps) {
  const isDoubles = eventType === 'Doubles';
  const SLOT_WIDTH = isDoubles ? 300 : 220;
  const X_SPACING = isDoubles ? 360 : 280;
  const roundsCount = Math.log2(drawSize) + 1; // +1 for the final winner node
  const containerWidth = OFFSET_X * 2 + (roundsCount - 1) * X_SPACING + SLOT_WIDTH;
  const containerHeight = OFFSET_Y * 2 + (drawSize - 1) * Y_SPACING + SLOT_HEIGHT;

  const getY = (r: number, i: number): number => {
    if (r === 0) return OFFSET_Y + i * Y_SPACING;
    return (getY(r - 1, i * 2) + getY(r - 1, i * 2 + 1)) / 2;
  };

  const getX = (r: number): number => OFFSET_X + r * X_SPACING;

  const findMatch = (round: number, position: number): MatchResult | undefined => {
    return matchResults.find(m => m.round === round && m.position === position);
  };

  const getWinnerName = (match: MatchResult): string => {
    if (!match.winnerEntryId) return '';
    if (match.winnerEntryId === match.player1EntryId) return match.player1Name;
    if (match.winnerEntryId === match.player2EntryId) return match.player2Name;
    return '';
  };

  const isMatchSelected = (round: number, position: number): boolean => {
    if (!selectedMatchId) return false;
    return selectedMatchId === `${round}-${position}`;
  };

  // SVG Paths
  const paths: React.ReactNode[] = [];
  for (let r = 0; r < roundsCount - 1; r++) {
    const numMatches = drawSize / Math.pow(2, r + 1);
    for (let m = 0; m < numMatches; m++) {
      const x = getX(r) + SLOT_WIDTH;
      const xNext = getX(r + 1);
      const xMid = (x + xNext) / 2;

      const yTop = getY(r, m * 2) + SLOT_HEIGHT / 2;
      const yBottom = getY(r, m * 2 + 1) + SLOT_HEIGHT / 2;
      const yMid = getY(r + 1, m) + SLOT_HEIGHT / 2;

      const matchResult = findMatch(r + 1, m + 1);
      const isFinished = matchResult && (matchResult.status === 'finished' || matchResult.status === 'walkover');
      const isPlaying = matchResult?.status === 'playing';
      const winnerIsTop = isFinished && matchResult.winnerEntryId && matchResult.winnerEntryId === matchResult.player1EntryId;
      const winnerIsBottom = isFinished && matchResult.winnerEntryId && matchResult.winnerEntryId === matchResult.player2EntryId;

      const getStroke = (isWinnerPath: boolean) => {
        if (isWinnerPath) return '#dc2626';
        if (isPlaying) return '#16a34a';
        return '#cbd5e1';
      };

      const getStrokeWidth = (isWinnerPath: boolean) => {
        if (isWinnerPath) return '2.5';
        if (isPlaying) return '2';
        return '2';
      };

      // Top path
      paths.push(
        <path
          key={`r${r}-m${m}-top`}
          d={`M ${x} ${yTop} L ${xMid} ${yTop} L ${xMid} ${yMid}`}
          fill="none"
          stroke={getStroke(!!winnerIsTop)}
          strokeWidth={getStrokeWidth(!!winnerIsTop)}
        />
      );

      // Bottom path
      paths.push(
        <path
          key={`r${r}-m${m}-bottom`}
          d={`M ${x} ${yBottom} L ${xMid} ${yBottom} L ${xMid} ${yMid}`}
          fill="none"
          stroke={getStroke(!!winnerIsBottom)}
          strokeWidth={getStrokeWidth(!!winnerIsBottom)}
        />
      );

      // Connection to next round
      const winnerExists = winnerIsTop || winnerIsBottom;
      paths.push(
        <path
          key={`r${r}-m${m}-conn`}
          d={`M ${xMid} ${yMid} L ${xNext} ${yMid}`}
          fill="none"
          stroke={winnerExists ? '#dc2626' : isPlaying ? '#16a34a' : '#cbd5e1'}
          strokeWidth={winnerExists ? '2.5' : '2'}
        />
      );
    }
  }

  // Final round match
  const finalRound = Math.log2(drawSize);
  const finalMatch = findMatch(finalRound, 1);
  const finalWinnerName = finalMatch ? getWinnerName(finalMatch) : '';

  // Status styling helper
  const getMatchNodeClasses = (match: MatchResult | undefined, selected: boolean): string => {
    const base = 'absolute flex items-center rounded-md transition-all cursor-pointer';
    const ring = selected ? 'ring-2 ring-primary-500' : '';

    if (!match || match.status === 'waiting') {
      return `${base} border border-dashed border-gray-300 bg-white hover:border-gray-400 hover:shadow ${ring}`;
    }
    if (match.status === 'ready') {
      return `${base} border border-blue-400 bg-blue-50 hover:border-blue-500 hover:shadow ${ring}`;
    }
    if (match.status === 'playing') {
      return `${base} border-2 border-green-500 bg-green-50 animate-pulse hover:shadow ${ring}`;
    }
    if (match.status === 'finished') {
      return `${base} border border-primary-500 bg-white shadow-sm hover:shadow ${ring}`;
    }
    if (match.status === 'walkover') {
      return `${base} border border-primary-500 bg-white shadow-sm hover:shadow ${ring}`;
    }
    return `${base} border border-gray-300 bg-white ${ring}`;
  };

  // Status badge
  const renderStatusBadge = (match: MatchResult) => {
    if (match.status === 'ready') {
      return (
        <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-700 leading-none whitespace-nowrap">
          準備完了
        </span>
      );
    }
    if (match.status === 'playing') {
      return (
        <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-green-100 text-green-700 leading-none whitespace-nowrap">
          試合中
        </span>
      );
    }
    if (match.status === 'walkover') {
      return (
        <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-gray-200 text-gray-600 leading-none whitespace-nowrap">
          W/O
        </span>
      );
    }
    return null;
  };

  return (
    <div className="relative overflow-auto bg-gray-50/50" style={{ width: '100%', height: '100%' }}>
      <div className="relative" style={{ width: containerWidth, height: containerHeight }}>
        {/* SVG Links */}
        <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%">
          {paths}
        </svg>

        {/* First Round Slots (display only, not draggable) */}
        {slots.map((slot, index) => {
          const x = getX(0);
          const y = getY(0, index);

          // Check if both players in this match are filled (for clickable hover)
          const matchIndex = Math.floor(index / 2);
          const pairSlot = index % 2 === 0 ? slots[index + 1] : slots[index - 1];
          const bothFilled = slot.entryId && pairSlot?.entryId;
          const firstRoundMatch = findMatch(1, matchIndex + 1);
          const isClickable = bothFilled && (!firstRoundMatch || firstRoundMatch.status === 'waiting');

          return (
            <div
              key={`slot-${slot.position}`}
              className={`absolute flex items-center px-3 gap-2 bg-white border shadow-sm rounded-md select-none
                ${slot.isBye ? 'border-dashed border-gray-300 text-gray-400' : 'border-gray-300'}
                ${isClickable ? 'hover:border-primary-400 hover:shadow cursor-pointer' : ''}
              `}
              style={{ left: x, top: y, width: SLOT_WIDTH, height: SLOT_HEIGHT }}
            >
              <div className="w-5 text-xs font-mono text-gray-400 border-r border-gray-100 pr-1">{slot.position}</div>
              {slot.seed > 0 && (
                <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                  {slot.seed}
                </div>
              )}
              <div className="flex-1 truncate whitespace-nowrap text-sm font-medium text-gray-800" title={slot.name}>
                {slot.name}
              </div>
              {!slot.isBye && slot.affiliation && (
                <div className={`text-xs text-gray-500 truncate ${isDoubles ? 'max-w-[100px]' : 'max-w-[60px]'}`} title={slot.affiliation}>
                  {slot.affiliation}
                </div>
              )}
            </div>
          );
        })}

        {/* Subsequent round match nodes (interactive) */}
        {Array.from({ length: roundsCount - 1 }).map((_, rIdx) => {
          const r = rIdx + 1;
          const numNodes = drawSize / Math.pow(2, r);

          return Array.from({ length: numNodes }).map((_, m) => {
            const x = getX(r);
            const y = getY(r, m);
            const isWinnerNode = r === roundsCount - 1;
            const matchResult = findMatch(r, m + 1);
            const winnerName = matchResult ? getWinnerName(matchResult) : '';
            const selected = isMatchSelected(r, m + 1);

            // Winner node
            if (isWinnerNode) {
              const displayName = finalWinnerName || winnerName;
              return (
                <div
                  key={`winner-r${r}-m${m}`}
                  className="absolute flex items-center px-3 bg-white border border-gray-200 border-b-2 border-b-primary-500 shadow rounded-md"
                  style={{ left: x, top: y, width: SLOT_WIDTH, height: SLOT_HEIGHT }}
                >
                  <div className="flex flex-col items-center justify-center w-full">
                    {displayName ? (
                      <>
                        <div className="flex items-center gap-1 justify-center w-full">
                          <Trophy className="w-3.5 h-3.5 text-yellow-500" />
                          <div className="text-primary-600 font-bold text-sm truncate whitespace-nowrap" title={displayName}>
                            {displayName}
                          </div>
                        </div>
                        <div className="text-[10px] text-primary-400 tracking-widest">WINNER</div>
                      </>
                    ) : (
                      <div className="flex items-center gap-1 justify-center w-full">
                        <Trophy className="w-3.5 h-3.5 text-gray-300" />
                        <div className="text-primary-600 font-bold text-sm tracking-widest">WINNER</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            // Interactive match nodes
            return (
              <div
                key={`match-r${r}-m${m}`}
                className={getMatchNodeClasses(matchResult, selected)}
                style={{ left: x, top: y, width: SLOT_WIDTH, height: SLOT_HEIGHT }}
                onClick={() => onMatchSelect(r, m + 1)}
              >
                <div className="flex flex-col justify-center w-full min-w-0 px-3">
                  {/* Finished / Walkover - show winner + score */}
                  {matchResult && (matchResult.status === 'finished' || matchResult.status === 'walkover') ? (
                    <>
                      <div className="flex items-center gap-1">
                        <div className="text-sm font-medium text-gray-800 truncate whitespace-nowrap flex-1" title={winnerName}>
                          {winnerName}
                        </div>
                        {renderStatusBadge(matchResult)}
                        {matchResult.courtName && (
                          <span className="shrink-0 bg-primary-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded leading-none">
                            {matchResult.courtName}
                          </span>
                        )}
                      </div>
                      {matchResult.score && (
                        <div className="text-[10px] text-gray-400 truncate" title={matchResult.score}>
                          {matchResult.score}
                        </div>
                      )}
                    </>
                  ) : matchResult && matchResult.status === 'playing' ? (
                    /* Playing - show both players + badges */
                    <>
                      <div className="flex items-center gap-1">
                        <div className="text-sm font-medium text-gray-800 truncate whitespace-nowrap flex-1">
                          {matchResult.player1Name && matchResult.player2Name
                            ? `${matchResult.player1Name} vs ${matchResult.player2Name}`
                            : matchResult.player1Name || matchResult.player2Name || '試合中...'}
                        </div>
                        {renderStatusBadge(matchResult)}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {matchResult.courtName && (
                          <span className="shrink-0 bg-primary-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded leading-none">
                            {matchResult.courtName}
                          </span>
                        )}
                        {matchResult.scheduledTime && (
                          <span className="shrink-0 bg-blue-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded leading-none">
                            {matchResult.scheduledTime}
                          </span>
                        )}
                      </div>
                    </>
                  ) : matchResult && matchResult.status === 'ready' ? (
                    /* Ready - show player names + badge */
                    <>
                      <div className="flex items-center gap-1">
                        <div className="text-sm font-medium text-gray-800 truncate whitespace-nowrap flex-1">
                          {matchResult.player1Name && matchResult.player2Name
                            ? `${matchResult.player1Name} vs ${matchResult.player2Name}`
                            : matchResult.player1Name || matchResult.player2Name || ''}
                        </div>
                        {renderStatusBadge(matchResult)}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {matchResult.scheduledTime && (
                          <span className="shrink-0 bg-blue-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded leading-none">
                            {matchResult.scheduledTime}
                          </span>
                        )}
                        {matchResult.courtName && (
                          <span className="shrink-0 bg-primary-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded leading-none">
                            {matchResult.courtName}
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    /* Waiting or no match */
                    <div className="flex items-center justify-between w-full">
                      <div className="text-sm text-gray-400 truncate">
                        {matchResult?.player1Name && matchResult?.player2Name
                          ? `${matchResult.player1Name} vs ${matchResult.player2Name}`
                          : matchResult?.player1Name || matchResult?.player2Name || ''}
                      </div>
                      <div className="flex items-center gap-1">
                        {matchResult?.scheduledTime && (
                          <span className="shrink-0 bg-blue-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded leading-none">
                            {matchResult.scheduledTime}
                          </span>
                        )}
                        {matchResult?.courtName && (
                          <span className="shrink-0 bg-primary-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded leading-none">
                            {matchResult.courtName}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}

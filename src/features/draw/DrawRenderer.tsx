import React from 'react';
import type { DrawSlotData, MatchResult } from './DrawBoard';

interface DrawRendererProps {
  slots: DrawSlotData[];
  drawSize: number;
  onDragStart: (e: React.DragEvent, position: number) => void;
  onDrop: (e: React.DragEvent, targetPosition: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onTap?: (position: number) => void;
  selectedPosition?: number | null;
  matchResults?: MatchResult[];
  eventType?: 'Singles' | 'Doubles' | 'Team';
}

const SLOT_HEIGHT = 44;
const Y_SPACING = 56;
const OFFSET_X = 40;
const OFFSET_Y = 40;

export default function DrawRenderer({ slots, drawSize, onDragStart, onDrop, onDragOver, onTap, selectedPosition, matchResults = [], eventType }: DrawRendererProps) {
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

  // Helper: find match result for a given round and position (both 1-indexed)
  const findMatch = (round: number, position: number): MatchResult | undefined => {
    return matchResults.find(m => m.round === round && m.position === position);
  };

  // Determine winner name from a match result
  const getWinnerName = (match: MatchResult): string => {
    if (!match.winnerEntryId) return '';
    if (match.winnerEntryId === match.player1EntryId) return match.player1Name;
    if (match.winnerEntryId === match.player2EntryId) return match.player2Name;
    return '';
  };

  // SVG Paths - split into top, bottom, and connection segments
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

      // Check match result for this bracket position
      // round is 1-indexed, position within round is 1-indexed
      const matchResult = findMatch(r + 1, m + 1);
      const isFinished = matchResult && (matchResult.status === 'finished' || matchResult.status === 'walkover');
      const winnerIsTop = isFinished && matchResult.winnerEntryId && matchResult.winnerEntryId === matchResult.player1EntryId;
      const winnerIsBottom = isFinished && matchResult.winnerEntryId && matchResult.winnerEntryId === matchResult.player2EntryId;

      // Top path: from slot to mid vertical
      paths.push(
        <path
          key={`r${r}-m${m}-top`}
          d={`M ${x} ${yTop} L ${xMid} ${yTop} L ${xMid} ${yMid}`}
          fill="none"
          stroke={winnerIsTop ? '#dc2626' : '#cbd5e1'}
          strokeWidth={winnerIsTop ? '2.5' : '2'}
        />
      );

      // Bottom path: from slot to mid vertical
      paths.push(
        <path
          key={`r${r}-m${m}-bottom`}
          d={`M ${x} ${yBottom} L ${xMid} ${yBottom} L ${xMid} ${yMid}`}
          fill="none"
          stroke={winnerIsBottom ? '#dc2626' : '#cbd5e1'}
          strokeWidth={winnerIsBottom ? '2.5' : '2'}
        />
      );

      // Connection to next round
      const winnerExists = winnerIsTop || winnerIsBottom;
      paths.push(
        <path
          key={`r${r}-m${m}-conn`}
          d={`M ${xMid} ${yMid} L ${xNext} ${yMid}`}
          fill="none"
          stroke={winnerExists ? '#dc2626' : '#cbd5e1'}
          strokeWidth={winnerExists ? '2.5' : '2'}
        />
      );
    }
  }

  // Find the final winner (last round match)
  const finalRound = Math.log2(drawSize); // e.g. drawSize=8 -> finalRound=3
  const finalMatch = findMatch(finalRound, 1);
  const finalWinnerName = finalMatch ? getWinnerName(finalMatch) : '';

  return (
    <div className="relative overflow-auto bg-gray-50/50" style={{ width: '100%', height: '100%' }}>
      <div className="relative" style={{ width: containerWidth, height: containerHeight }}>
        {/* SVG Links */}
        <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%">
          {paths}
        </svg>

        {/* First Round Slots (Draggable + Tappable) */}
        {slots.map((slot, index) => {
          const x = getX(0);
          const y = getY(0, index);
          const isSelected = selectedPosition === slot.position;

          return (
            <div
              key={`slot-${slot.position}`}
              draggable
              onDragStart={(e) => onDragStart(e, slot.position)}
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, slot.position)}
              onClick={() => onTap?.(slot.position)}
              className={`absolute flex items-center px-3 gap-2 bg-white border shadow-sm rounded-md select-none cursor-grab active:cursor-grabbing hover:border-indigo-400 transition-colors
                ${slot.isBye ? 'border-dashed border-gray-300 text-gray-400' : 'border-gray-300'}
                ${isSelected ? 'ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50' : ''}
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

        {/* Subsequent round slots with match results */}
        {Array.from({ length: roundsCount - 1 }).map((_, rIdx) => {
          const r = rIdx + 1; // round 1 to N (visual round index)
          const numNodes = drawSize / Math.pow(2, r);

          return Array.from({ length: numNodes }).map((_, m) => {
            const x = getX(r);
            const y = getY(r, m);
            const isWinner = r === roundsCount - 1;

            // Find match result: the match that feeds into this slot
            // This slot at visual round r, position m receives the winner of round r, position m+1
            const matchResult = findMatch(r, m + 1);
            const winnerName = matchResult ? getWinnerName(matchResult) : '';
            const isPlaying = matchResult?.status === 'playing';
            const isFinished = matchResult && (matchResult.status === 'finished' || matchResult.status === 'walkover');

            // For the WINNER node, look at the final round match
            const displayName = isWinner
              ? (finalWinnerName || (isFinished ? winnerName : ''))
              : winnerName;

            const bgClass = isPlaying
              ? 'bg-green-100'
              : isWinner
                ? 'bg-white shadow'
                : 'bg-white/60';

            return (
              <div
                key={`empty-r${r}-m${m}`}
                className={`absolute flex items-center px-3 ${bgClass} border border-gray-200 border-b-2 shadow-sm rounded-md
                  ${isWinner ? 'border-b-indigo-500 text-indigo-600 font-bold' : 'border-b-gray-400'}
                `}
                style={{ left: x, top: y, width: SLOT_WIDTH, height: SLOT_HEIGHT }}
              >
                {isWinner ? (
                  <div className="flex flex-col items-center justify-center w-full">
                    {displayName ? (
                      <>
                        <div className="text-indigo-600 font-bold text-sm truncate whitespace-nowrap w-full text-center" title={displayName}>
                          {displayName}
                        </div>
                        <div className="text-[10px] text-indigo-400 tracking-widest">WINNER</div>
                      </>
                    ) : (
                      <div className="text-indigo-600 font-bold text-sm tracking-widest w-full text-center">WINNER</div>
                    )}
                  </div>
                ) : displayName ? (
                  <div className="flex flex-col justify-center w-full min-w-0">
                    <div className="flex items-center gap-1">
                      <div className="text-sm font-medium text-gray-800 truncate whitespace-nowrap flex-1" title={displayName}>
                        {displayName}
                      </div>
                      {matchResult?.scheduledTime && matchResult.round === 1 && (
                        <div className="shrink-0 bg-ocean text-white text-[9px] font-bold px-1.5 py-0.5 rounded leading-none">
                          {matchResult.scheduledTime}
                        </div>
                      )}
                      {matchResult?.courtName && (
                        <div className="shrink-0 bg-primary-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded leading-none">
                          {matchResult.courtName}
                        </div>
                      )}
                    </div>
                    {matchResult?.score && (
                      <div className="text-[10px] text-gray-400 truncate" title={matchResult.score}>
                        {matchResult.score}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between w-full">
                    <div className="text-gray-300 text-sm">
                      {isPlaying ? '試合中...' : ''}
                    </div>
                    <div className="flex items-center gap-1">
                      {matchResult?.scheduledTime && matchResult.round === 1 && (
                        <div className="shrink-0 bg-ocean text-white text-[9px] font-bold px-1.5 py-0.5 rounded leading-none">
                          {matchResult.scheduledTime}
                        </div>
                      )}
                      {matchResult?.courtName && (
                        <div className="shrink-0 bg-primary-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded leading-none">
                          {matchResult.courtName}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}

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
  onMatchClick?: (round: number, position: number) => void;
}

// --- Layout constants (paper-style) ---
const ROW_H = 28;           // height per first-round row
const SLOT_W = 200;         // first-round name area width
const ROUND_W = 80;         // width per subsequent round column
const OFFSET_X = 8;
const OFFSET_Y = 24;
const LINE_COLOR = '#333';
const WIN_COLOR = '#E53E3E';
const LOSE_COLOR = '#CBD5E0';
const SEED_BG = '#FFF2CC';
const BYE_BG = '#F2F2F2';

/** Parse score like "8-6", "6-4 7-5", "6-4 6-7(3) [10-5]" into p1/p2 parts */
function parseScore(score: string): { p1: string; p2: string } | null {
  if (!score) return null;
  const clean = score.replace(/\s*W\.O\.?\s*/gi, '').replace(/\s*Ret\.?\s*/gi, '').trim();
  if (!clean) return null;

  const parts = clean.split(/\s+/).filter(Boolean);
  const p1Parts: string[] = [];
  const p2Parts: string[] = [];

  for (const part of parts) {
    // Super tiebreak [10-5]
    const stb = part.match(/^\[(\d+)-(\d+)\]$/);
    if (stb) { p1Parts.push(`[${stb[1]}`); p2Parts.push(`${stb[2]}]`); continue; }
    // Normal: 6-4 or 7-6(3)
    const m = part.match(/^(\d+)-(\d+)(?:\((\d+)\))?$/);
    if (m) {
      p1Parts.push(m[1]);
      p2Parts.push(m[3] ? `${m[2]}(${m[3]})` : m[2]);
    }
  }
  if (p1Parts.length === 0) return null;
  return { p1: p1Parts.join(' '), p2: p2Parts.join(' ') };
}

export default function DrawRenderer({
  slots, drawSize, onDragStart, onDrop, onDragOver, onTap, selectedPosition,
  matchResults = [], eventType, onMatchClick,
}: DrawRendererProps) {
  const isDoubles = eventType === 'Doubles';
  const slotW = isDoubles ? 260 : SLOT_W;
  const roundW = isDoubles ? 100 : ROUND_W;
  const totalRounds = Math.log2(drawSize); // number of match rounds (not including winner)

  // Y position for each first-round row (0-indexed)
  const getY = (r: number, i: number): number => {
    if (r === 0) return OFFSET_Y + i * ROW_H;
    return (getY(r - 1, i * 2) + getY(r - 1, i * 2 + 1)) / 2;
  };

  // X position for the start of each round's bracket line area
  const getLineX = (r: number): number => OFFSET_X + slotW + r * roundW;

  const findMatch = (round: number, position: number): MatchResult | undefined =>
    matchResults.find(m => m.round === round && m.position === position);

  const getWinnerName = (match: MatchResult): string => {
    if (!match.winnerEntryId) return '';
    if (match.winnerEntryId === match.player1EntryId) return match.player1Name;
    if (match.winnerEntryId === match.player2EntryId) return match.player2Name;
    return '';
  };

  const containerW = OFFSET_X + slotW + totalRounds * roundW + 120;
  const containerH = OFFSET_Y + drawSize * ROW_H + 20;

  // --- Build SVG elements ---
  const svgElements: React.ReactNode[] = [];
  const htmlElements: React.ReactNode[] = [];

  // Round labels
  for (let r = 0; r < totalRounds; r++) {
    const label = r === totalRounds - 1 ? '決勝'
      : r === totalRounds - 2 ? '準決勝'
      : r === totalRounds - 3 ? '準々決勝'
      : `${r + 1}回戦`;
    const x = getLineX(r) + roundW / 2;
    svgElements.push(
      <text key={`rl-${r}`} x={x} y={14} textAnchor="middle"
        className="fill-gray-400" style={{ fontSize: 10, fontWeight: 500 }}>
        {label}
      </text>
    );
  }
  // Winner label
  svgElements.push(
    <text key="rl-winner" x={getLineX(totalRounds) + 30} y={14} textAnchor="middle"
      className="fill-gray-400" style={{ fontSize: 10, fontWeight: 500 }}>
      優勝
    </text>
  );

  // --- Bracket lines & scores for each round ---
  for (let r = 0; r < totalRounds; r++) {
    const numMatches = drawSize / Math.pow(2, r + 1);
    const lineX = getLineX(r);        // left edge of this round's line area
    const nextLineX = getLineX(r + 1); // left edge of next round

    for (let m = 0; m < numMatches; m++) {
      const yTop = getY(r, m * 2) + ROW_H / 2;
      const yBot = getY(r, m * 2 + 1) + ROW_H / 2;
      const yMid = (yTop + yBot) / 2;

      const match = findMatch(r + 1, m + 1);
      const isFinished = match && (match.status === 'finished' || match.status === 'walkover');
      const isPlaying = match?.status === 'playing';
      const isReady = match?.status === 'ready';
      const winnerIsP1 = isFinished && match.winnerEntryId === match.player1EntryId;
      const winnerIsP2 = isFinished && match.winnerEntryId === match.player2EntryId;
      const isWalkover = match?.status === 'walkover';

      // Horizontal line from top slot
      const topColor = winnerIsP1 ? WIN_COLOR : (isFinished ? LOSE_COLOR : LINE_COLOR);
      const topWidth = winnerIsP1 ? 2.5 : 1;
      svgElements.push(
        <line key={`h-t-${r}-${m}`} x1={lineX} y1={yTop} x2={lineX + roundW / 2} y2={yTop}
          stroke={topColor} strokeWidth={topWidth} />
      );

      // Horizontal line from bottom slot
      const botColor = winnerIsP2 ? WIN_COLOR : (isFinished ? LOSE_COLOR : LINE_COLOR);
      const botWidth = winnerIsP2 ? 2.5 : 1;
      svgElements.push(
        <line key={`h-b-${r}-${m}`} x1={lineX} y1={yBot} x2={lineX + roundW / 2} y2={yBot}
          stroke={botColor} strokeWidth={botWidth} />
      );

      // Vertical connector
      svgElements.push(
        <line key={`v-${r}-${m}`} x1={lineX + roundW / 2} y1={yTop} x2={lineX + roundW / 2} y2={yBot}
          stroke={isFinished ? LOSE_COLOR : LINE_COLOR} strokeWidth={1} />
      );
      // Winner vertical highlight (only winner side)
      if (winnerIsP1) {
        svgElements.push(
          <line key={`vw-${r}-${m}`} x1={lineX + roundW / 2} y1={yTop} x2={lineX + roundW / 2} y2={yMid}
            stroke={WIN_COLOR} strokeWidth={2.5} />
        );
      }
      if (winnerIsP2) {
        svgElements.push(
          <line key={`vw-${r}-${m}`} x1={lineX + roundW / 2} y1={yBot} x2={lineX + roundW / 2} y2={yMid}
            stroke={WIN_COLOR} strokeWidth={2.5} />
        );
      }

      // Connection to next round (horizontal from mid to next)
      const connColor = isFinished ? WIN_COLOR : LINE_COLOR;
      const connWidth = isFinished ? 2.5 : 1;
      svgElements.push(
        <line key={`c-${r}-${m}`} x1={lineX + roundW / 2} y1={yMid} x2={nextLineX} y2={yMid}
          stroke={connColor} strokeWidth={connWidth} />
      );

      // --- Score display (red text on lines) ---
      if (match?.score && isFinished) {
        const parsed = parseScore(match.score);
        if (parsed) {
          // P1 score above top horizontal line
          svgElements.push(
            <text key={`s1-${r}-${m}`} x={lineX + 4} y={yTop - 3}
              style={{ fontSize: 10, fontWeight: 600 }} fill={WIN_COLOR}>
              {parsed.p1}
            </text>
          );
          // P2 score below bottom horizontal line
          svgElements.push(
            <text key={`s2-${r}-${m}`} x={lineX + 4} y={yBot + 11}
              style={{ fontSize: 10, fontWeight: 600 }} fill={WIN_COLOR}>
              {parsed.p2}
            </text>
          );
        }
        if (isWalkover) {
          svgElements.push(
            <text key={`wo-${r}-${m}`} x={lineX + 4} y={yMid + 4}
              style={{ fontSize: 9, fontWeight: 700 }} fill={WIN_COLOR}>
              W.O.
            </text>
          );
        }
      }

      // --- Winner name in next round slot area ---
      if (isFinished) {
        const winnerName = getWinnerName(match);
        if (winnerName) {
          htmlElements.push(
            <div key={`wn-${r}-${m}`}
              className="absolute truncate text-xs font-semibold text-gray-800 pointer-events-none"
              style={{
                left: nextLineX + 2,
                top: yMid - ROW_H / 2,
                width: roundW - 6,
                height: ROW_H,
                lineHeight: `${ROW_H}px`,
              }}
              title={winnerName}>
              {winnerName}
            </div>
          );
        }
      }

      // --- Court number badge (playing / ready) ---
      if (match && (isPlaying || isReady)) {
        const courtNum = match.courtName?.replace(/[^\d]/g, '') || '';
        const bgColor = isPlaying ? '#22c55e' : '#f97316';
        const badgeX = lineX + roundW / 2 - 12;
        const badgeY = yMid - 10;

        htmlElements.push(
          <div key={`ct-${r}-${m}`}
            className={`absolute flex items-center justify-center rounded-md shadow-sm font-bold text-white text-xs ${isPlaying ? 'animate-pulse' : ''}`}
            style={{
              left: badgeX - 2,
              top: badgeY - 2,
              width: 28,
              height: 20,
              backgroundColor: bgColor,
              zIndex: 10,
            }}>
            {courtNum || 'C'}
          </div>
        );

        // Scheduled time below court badge
        if (match.scheduledTime) {
          svgElements.push(
            <text key={`tm-${r}-${m}`} x={lineX + roundW / 2} y={yMid + 20}
              textAnchor="middle" style={{ fontSize: 8, fontWeight: 500 }} fill="#666">
              {match.scheduledTime}
            </text>
          );
        }
      }

      // --- Clickable area for match interaction ---
      if (match && onMatchClick) {
        htmlElements.push(
          <div key={`click-${r}-${m}`}
            className="absolute cursor-pointer hover:bg-blue-50/40 rounded transition-colors"
            style={{
              left: lineX,
              top: yTop - ROW_H / 2 + 2,
              width: roundW,
              height: yBot - yTop + ROW_H - 4,
              zIndex: 5,
            }}
            onClick={() => onMatchClick(r + 1, m + 1)}
            title={`${match.player1Name} vs ${match.player2Name}`}
          />
        );
      }
    }
  }

  // --- Winner display (final) ---
  const finalMatch = findMatch(totalRounds, 1);
  const finalWinnerName = finalMatch ? getWinnerName(finalMatch) : '';
  const winnerX = getLineX(totalRounds);
  const winnerY = getY(totalRounds, 0);

  if (finalWinnerName) {
    htmlElements.push(
      <div key="winner"
        className="absolute flex items-center gap-1.5 px-2 py-0.5 bg-yellow-50 border-2 border-yellow-400 rounded-md shadow"
        style={{
          left: winnerX + 2,
          top: winnerY + ROW_H / 2 - 14,
          zIndex: 10,
        }}>
        <span className="text-yellow-600 text-base">🏆</span>
        <span className="text-sm font-bold text-gray-900 whitespace-nowrap">{finalWinnerName}</span>
      </div>
    );
  }

  // --- First-round player slots ---
  const slotElements = slots.map((slot, index) => {
    const x = OFFSET_X;
    const y = getY(0, index);
    const isSelected = selectedPosition === slot.position;
    const isSeed = slot.seed > 0;
    const isBye = slot.isBye;

    return (
      <div
        key={`slot-${slot.position}`}
        draggable
        onDragStart={(e) => onDragStart(e, slot.position)}
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, slot.position)}
        onClick={() => onTap?.(slot.position)}
        className={`absolute flex items-center select-none cursor-grab active:cursor-grabbing
          ${isSelected ? 'ring-2 ring-indigo-500 bg-indigo-50' : ''}
        `}
        style={{
          left: x,
          top: y,
          width: slotW,
          height: ROW_H,
          backgroundColor: isBye ? BYE_BG : (isSeed ? SEED_BG : '#fff'),
          borderBottom: `1px solid ${isBye ? '#e5e5e5' : '#333'}`,
        }}
      >
        {/* Draw number */}
        <div className="w-6 text-[10px] font-mono text-gray-500 text-right pr-1 shrink-0 self-stretch flex items-center justify-end border-r border-gray-200">
          {slot.position}
        </div>
        {/* Seed badge */}
        {isSeed && (
          <div className="w-4 text-[10px] font-bold text-amber-700 text-center shrink-0">
            {slot.seed}
          </div>
        )}
        {/* Player name */}
        <div className={`flex-1 min-w-0 px-1 text-xs truncate ${isBye ? 'text-gray-400' : 'font-medium text-gray-900'}`}>
          {isBye ? 'BYE' : slot.name}
        </div>
        {/* Affiliation */}
        {!isBye && slot.affiliation && (
          <div className="text-[10px] text-gray-500 truncate max-w-[60px] pr-1" title={slot.affiliation}>
            ({slot.affiliation})
          </div>
        )}
      </div>
    );
  });

  return (
    <div className="relative overflow-auto bg-white" style={{ width: '100%', height: '100%' }}>
      <div className="relative" style={{ width: containerW, height: containerH, minWidth: containerW }}>
        <svg className="absolute inset-0 pointer-events-none" width={containerW} height={containerH}>
          {svgElements}
        </svg>
        {slotElements}
        {htmlElements}
      </div>
    </div>
  );
}

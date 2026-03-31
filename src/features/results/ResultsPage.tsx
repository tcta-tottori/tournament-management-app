import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as XLSX from 'xlsx';
import { db } from '../../db/database';
import type { Match, Draw, Entry, Player, Event } from '../../db/database';
import { useAppStore } from '../../stores/appStore';
import {
  exportTournamentResultAsJpeg,
  exportTournamentResultAsExcel,
  exportRoundRobinResultAsJpeg,
  exportRoundRobinResultAsExcel,
} from '../draw/DrawResultExporter';
import type { ResultExportOptions } from '../draw/DrawResultExporter';
import {
  Medal,
  Trophy,
  Download,
  FileSpreadsheet,
  Image,
  Printer,
  Crown,
  Users,
} from 'lucide-react';
import { useMixedStore } from '../mixed/mixedStore';
import MixedResultsExport from '../mixed/MixedResultsExport';

// ---------- helpers ----------

type SlotInfo = {
  position: number;
  name: string;
  affiliation: string;
  seed: number;
  isBye: boolean;
  entryId: string | null;
};

function buildSlotMap(draw: Draw, entries: Entry[], players: Player[]): Map<number, SlotInfo> {
  const map = new Map<number, SlotInfo>();
  for (const s of draw.slots) {
    let name = 'bye';
    let affiliation = '';
    if (!s.isBye && s.entryId) {
      const entry = entries.find(e => e.entryId === s.entryId);
      if (entry) {
        const p1 = players.find(p => p.playerId === entry.playerId);
        const isDoubles = !!entry.partnerId;
        const p2 = isDoubles ? players.find(p => p.playerId === entry.partnerId) : null;
        name = isDoubles && p1 && p2 ? `${p1.name}・${p2.name}` : (p1?.name || '(不明)');
        affiliation = isDoubles && p1 && p2 && p1.affiliation !== p2.affiliation
          ? `${p1.affiliation}/${p2.affiliation}`
          : (p1?.affiliation || '');
      }
    }
    map.set(s.position, { position: s.position, name, affiliation, seed: s.seed, isBye: s.isBye, entryId: s.entryId });
  }
  return map;
}

function findMatch(matches: Match[], p1: SlotInfo, p2: SlotInfo): Match | undefined {
  return matches.find(m =>
    (m.player1EntryId === p1.entryId && m.player2EntryId === p2.entryId) ||
    (m.player1EntryId === p2.entryId && m.player2EntryId === p1.entryId)
  );
}

// ---------- per-event analysis ----------

interface TournamentResult {
  winner: string | null;
  winnerAffiliation: string;
  runnerUp: string | null;
  runnerUpAffiliation: string;
  semiFinalists: { name: string; affiliation: string }[];
  totalMatches: number;
  finishedMatches: number;
}

function analyzeTournament(draw: Draw, matches: Match[]): TournamentResult {
  const totalRounds = Math.log2(draw.drawSize);
  const totalMatches = matches.length;
  const finishedMatches = matches.filter(m => m.status === 'finished' || m.status === 'walkover').length;

  const finalMatch = matches.find(m => m.round === totalRounds && (m.status === 'finished' || m.status === 'walkover'));

  let winner: string | null = null;
  let winnerAffiliation = '';
  let runnerUp: string | null = null;
  let runnerUpAffiliation = '';

  if (finalMatch?.winnerEntryId) {
    const isP1Winner = finalMatch.winnerEntryId === finalMatch.player1EntryId;
    winner = isP1Winner ? finalMatch.player1Name : finalMatch.player2Name;
    winnerAffiliation = isP1Winner ? finalMatch.player1Affiliation : finalMatch.player2Affiliation;
    runnerUp = isP1Winner ? finalMatch.player2Name : finalMatch.player1Name;
    runnerUpAffiliation = isP1Winner ? finalMatch.player2Affiliation : finalMatch.player1Affiliation;
  }

  const sfMatches = matches.filter(m => m.round === totalRounds - 1 && (m.status === 'finished' || m.status === 'walkover'));
  const semiFinalists = sfMatches
    .map(m => {
      if (!m.winnerEntryId) return null;
      const isP1Winner = m.winnerEntryId === m.player1EntryId;
      return {
        name: isP1Winner ? m.player2Name : m.player1Name,
        affiliation: isP1Winner ? m.player2Affiliation : m.player1Affiliation,
      };
    })
    .filter((x): x is { name: string; affiliation: string } => x !== null && !!x.name);

  return { winner, winnerAffiliation, runnerUp, runnerUpAffiliation, semiFinalists, totalMatches, finishedMatches };
}

interface RoundRobinStanding {
  name: string;
  affiliation: string;
  wins: number;
  losses: number;
  rank: number;
}

function analyzeRoundRobin(draw: Draw, matches: Match[], entries: Entry[], players: Player[]): {
  standings: RoundRobinStanding[];
  totalMatches: number;
  finishedMatches: number;
} {
  const slotMap = buildSlotMap(draw, entries, players);
  const playerSlots = draw.slots
    .filter(s => !s.isBye)
    .sort((a, b) => a.position - b.position)
    .map(s => slotMap.get(s.position)!)
    .filter(Boolean);

  const totalMatches = matches.length;
  const finishedMatches = matches.filter(m => m.status === 'finished' || m.status === 'walkover').length;

  const stats = playerSlots.map(p => {
    let wins = 0, losses = 0;
    for (const other of playerSlots) {
      if (other.entryId === p.entryId) continue;
      const m = findMatch(matches, p, other);
      if (m?.winnerEntryId) {
        if (m.winnerEntryId === p.entryId) wins++;
        else losses++;
      }
    }
    return { ...p, wins, losses };
  });

  // rank by wins desc, then losses asc
  const sorted = [...stats].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.losses - b.losses;
  });

  const standings: RoundRobinStanding[] = sorted.map((s, i) => ({
    name: s.name,
    affiliation: s.affiliation,
    wins: s.wins,
    losses: s.losses,
    rank: i + 1,
  }));

  return { standings, totalMatches, finishedMatches };
}

// ---------- component ----------

export default function ResultsPage() {
  const isMixedImported = useMixedStore(s => s.isImported);

  // ミックスダブルスモード
  if (isMixedImported) {
    return <MixedResultsExport />;
  }

  const currentTournamentId = useAppStore(s => s.currentTournamentId);

  const tournaments = useLiveQuery(() => db.tournaments.toArray()) || [];
  const events = useLiveQuery(
    () => currentTournamentId
      ? db.events.where('tournamentId').equals(currentTournamentId).toArray()
      : [],
    [currentTournamentId]
  ) || [];
  const draws = useLiveQuery(() => db.draws.toArray()) || [];
  const allMatches = useLiveQuery(() => db.matches.toArray()) || [];
  const allEntries = useLiveQuery(() => db.entries.toArray()) || [];
  const players = useLiveQuery(() => db.players.toArray()) || [];

  const tournament = useMemo(
    () => tournaments.find(t => t.tournamentId === currentTournamentId) ?? null,
    [tournaments, currentTournamentId]
  );

  // Build export opts for an event
  const buildExportOpts = (event: Event): ResultExportOptions | null => {
    if (!tournament) return null;
    const draw = draws.find(d => d.eventId === event.eventId);
    if (!draw) return null;
    const eventMatches = allMatches.filter(m => m.eventId === event.eventId);
    const eventEntries = allEntries.filter(e => e.eventId === event.eventId);
    return { tournament, event, draw, matches: eventMatches, entries: eventEntries, players };
  };

  // ---------- batch export: all events Excel (multi-sheet workbook) ----------
  const handleBatchExcel = () => {
    if (!tournament) return;
    const wb = XLSX.utils.book_new();
    let sheetCount = 0;

    for (const event of events) {
      const opts = buildExportOpts(event);
      if (!opts) continue;
      const draw = opts.draw;
      const isRR = draw.drawType === 'roundRobin';

      if (isRR) {
        // build round-robin sheet inline (same logic as exportRoundRobinResultAsExcel)
        const slotMap = buildSlotMap(draw, opts.entries, players);
        const playerSlots = draw.slots
          .filter(s => !s.isBye)
          .sort((a, b) => a.position - b.position)
          .map(s => slotMap.get(s.position)!)
          .filter(Boolean);
        const n = playerSlots.length;
        if (n < 2) continue;

        const getScore = (rowP: SlotInfo, colP: SlotInfo): string => {
          const m = findMatch(opts.matches, rowP, colP);
          if (!m || !m.winnerEntryId) return '';
          if (m.score) {
            if (m.player1EntryId === rowP.entryId) return m.score;
            const parts = m.score.split('-');
            if (parts.length === 2) return `${parts[1].trim()}-${parts[0].trim()}`;
            return m.score;
          }
          return m.winnerEntryId === rowP.entryId ? '\u25CB' : '\u25CF';
        };

        const stats = playerSlots.map(p => {
          let wins = 0, losses = 0;
          for (const other of playerSlots) {
            if (other.entryId === p.entryId) continue;
            const m = findMatch(opts.matches, p, other);
            if (m?.winnerEntryId) {
              if (m.winnerEntryId === p.entryId) wins++; else losses++;
            }
          }
          return { wins, losses };
        });

        const rankings = playerSlots.map((_, i) => i);
        rankings.sort((a, b) => stats[b].wins !== stats[a].wins ? stats[b].wins - stats[a].wins : stats[a].losses - stats[b].losses);
        const rankMap = new Map<number, number>();
        rankings.forEach((pi, ri) => rankMap.set(pi, ri + 1));

        const data: (string | null)[][] = [];
        data.push([event.name, ...Array(n).fill(null), tournament.name]);
        data.push([]);
        const headerRow: (string | null)[] = [''];
        for (const p of playerSlots) headerRow.push(p.name);
        headerRow.push('\u52DD\u3000\u6557', '\u9806\u3000\u4F4D');
        data.push(headerRow);
        for (let row = 0; row < n; row++) {
          const p = playerSlots[row];
          const cells: (string | null)[] = [`${row + 1}  ${p.name}${p.affiliation ? `\uFF08${p.affiliation}\uFF09` : ''}`];
          for (let col = 0; col < n; col++) {
            cells.push(row === col ? '' : getScore(p, playerSlots[col]));
          }
          const s = stats[row];
          cells.push(s.wins > 0 || s.losses > 0 ? `${s.wins}-${s.losses}` : '');
          const rank = rankMap.get(row);
          cells.push(rank && (s.wins > 0 || s.losses > 0) ? `${rank}\u4F4D` : '');
          data.push(cells);
        }

        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = [{ wch: 30 }, ...Array(n).fill({ wch: 12 }), { wch: 10 }, { wch: 8 }];
        XLSX.utils.book_append_sheet(wb, ws, event.name.substring(0, 31));
        sheetCount++;
      } else {
        // For tournament draws, call the individual exporter per event (downloads separately)
        // To combine into one workbook we'd need to replicate the full logic; instead we use a simpler approach
        exportTournamentResultAsExcel(opts);
        sheetCount++;
      }
    }

    if (sheetCount > 0 && events.some(e => draws.find(d => d.eventId === e.eventId)?.drawType === 'roundRobin')) {
      XLSX.writeFile(wb, `${tournament.name}_全種目結果.xlsx`);
    }
  };

  // ---------- batch export: all events JPEG ----------
  const handleBatchJpeg = () => {
    for (const event of events) {
      const opts = buildExportOpts(event);
      if (!opts) continue;
      const draw = opts.draw;
      const isRR = draw.drawType === 'roundRobin';
      if (isRR) {
        exportRoundRobinResultAsJpeg(opts);
      } else {
        exportTournamentResultAsJpeg(opts);
      }
    }
  };

  // ---------- print ----------
  const handlePrint = () => {
    window.print();
  };

  // ---------- per-event export ----------
  const handleEventExcel = (event: Event) => {
    const opts = buildExportOpts(event);
    if (!opts) return;
    const draw = opts.draw;
    if (draw.drawType === 'roundRobin') {
      exportRoundRobinResultAsExcel(opts);
    } else {
      exportTournamentResultAsExcel(opts);
    }
  };

  const handleEventJpeg = (event: Event) => {
    const opts = buildExportOpts(event);
    if (!opts) return;
    const draw = opts.draw;
    if (draw.drawType === 'roundRobin') {
      exportRoundRobinResultAsJpeg(opts);
    } else {
      exportTournamentResultAsJpeg(opts);
    }
  };

  // ---------- render ----------

  if (!currentTournamentId || !tournament) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="bg-white rounded-xl card-tottori p-8 text-center text-gray-500">
          <Medal className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-semibold">大会が選択されていません</p>
          <p className="text-sm mt-1">ヘッダーから対象大会を選択してください。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6 print:space-y-4">
      {/* ===== Header card ===== */}
      <header className="bg-white p-4 rounded-xl card-tottori">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <Medal className="w-6 h-6 text-primary-500" />
          大会結果
        </h1>
        <p className="text-sm text-gray-500 mt-1 hidden sm:block">
          {tournament.name}
        </p>
      </header>

      {/* ===== Batch toolbar ===== */}
      <section className="bg-white rounded-xl card-tottori p-4 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <Download className="w-4 h-4 text-primary-500" />
            一括出力
          </span>
          <button
            onClick={handleBatchExcel}
            disabled={events.length === 0}
            className="flex items-center gap-1.5 bg-teal-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            全種目Excel出力
          </button>
          <button
            onClick={handleBatchJpeg}
            disabled={events.length === 0}
            className="flex items-center gap-1.5 bg-orange-500 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
          >
            <Image className="w-4 h-4" />
            全種目JPEG出力
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-700 shadow-sm transition-colors"
          >
            <Printer className="w-4 h-4" />
            印刷
          </button>
        </div>
      </section>

      {/* ===== Per-event result cards ===== */}
      {events.length === 0 && (
        <div className="bg-white rounded-xl card-tottori p-8 text-center text-gray-500">
          <Trophy className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-semibold">この大会にはまだ種目が登録されていません。</p>
        </div>
      )}

      {events.map(event => {
        const draw = draws.find(d => d.eventId === event.eventId);
        if (!draw) return (
          <section key={event.eventId} className="bg-white rounded-xl card-tottori overflow-hidden">
            <div className="bg-primary-50 px-4 py-3 border-b border-border-main flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary-500" />
              <h2 className="font-semibold text-primary-600">{event.name}</h2>
            </div>
            <div className="p-6 text-center text-gray-400 text-sm">ドローが作成されていません</div>
          </section>
        );

        const eventMatches = allMatches.filter(m => m.eventId === event.eventId);
        const eventEntries = allEntries.filter(e => e.eventId === event.eventId);
        const isRR = draw.drawType === 'roundRobin';

        if (isRR) {
          return <RoundRobinCard key={event.eventId} event={event} draw={draw} matches={eventMatches} entries={eventEntries} players={players} onExcel={() => handleEventExcel(event)} onJpeg={() => handleEventJpeg(event)} />;
        } else {
          return <TournamentCard key={event.eventId} event={event} draw={draw} matches={eventMatches} onExcel={() => handleEventExcel(event)} onJpeg={() => handleEventJpeg(event)} />;
        }
      })}
    </div>
  );
}

// ---------- Tournament result card ----------

function TournamentCard({ event, draw, matches, onExcel, onJpeg }: {
  event: Event;
  draw: Draw;
  matches: Match[];
  onExcel: () => void;
  onJpeg: () => void;
}) {
  const result = useMemo(() => analyzeTournament(draw, matches), [draw, matches]);
  const completionPct = result.totalMatches > 0
    ? Math.round((result.finishedMatches / result.totalMatches) * 100)
    : 0;

  return (
    <section className="bg-white rounded-xl card-tottori overflow-hidden">
      {/* header */}
      <div className="bg-primary-50 px-4 py-3 border-b border-border-main flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary-500" />
          <h2 className="font-semibold text-primary-600">{event.name}</h2>
          <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded-full border border-border-main">
            ドロー {draw.drawSize}
          </span>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={onExcel}
            className="flex items-center gap-1 bg-teal-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-teal-700 shadow-sm transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel
          </button>
          <button
            onClick={onJpeg}
            className="flex items-center gap-1 bg-orange-500 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-orange-600 shadow-sm transition-colors"
          >
            <Image className="w-3.5 h-3.5" />
            JPEG
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Winners podium */}
        <div className="space-y-3">
          {/* Champion */}
          {result.winner && (
            <div className="flex items-center gap-3 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-lg px-4 py-3">
              <span className="text-2xl">🥇</span>
              <Crown className="w-5 h-5 text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-amber-600 uppercase tracking-wider">優勝</div>
                <div className="text-base font-bold text-gray-900 truncate">{result.winner}</div>
                {result.winnerAffiliation && (
                  <div className="text-xs text-amber-700">{result.winnerAffiliation}</div>
                )}
              </div>
            </div>
          )}

          {/* Runner-up */}
          {result.runnerUp && (
            <div className="flex items-center gap-3 bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-200 rounded-lg px-4 py-2.5">
              <span className="text-xl">🥈</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">準優勝</div>
                <div className="text-sm font-bold text-gray-800 truncate">{result.runnerUp}</div>
                {result.runnerUpAffiliation && (
                  <div className="text-xs text-gray-500">{result.runnerUpAffiliation}</div>
                )}
              </div>
            </div>
          )}

          {/* Semi-finalists */}
          {result.semiFinalists.length > 0 && (
            <div className="flex items-start gap-3 bg-gradient-to-r from-orange-50/50 to-amber-50/30 border border-orange-200/60 rounded-lg px-4 py-2.5">
              <span className="text-lg mt-0.5">🥉</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-orange-600/80 uppercase tracking-wider mb-1">ベスト4</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {result.semiFinalists.map((sf, i) => (
                    <div key={i} className="text-sm text-gray-700">
                      <span className="font-semibold">{sf.name}</span>
                      {sf.affiliation && (
                        <span className="text-xs text-gray-500 ml-1">({sf.affiliation})</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!result.winner && !result.runnerUp && (
            <div className="text-center text-gray-400 text-sm py-4">
              まだ結果が確定していません
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              試合数: {result.finishedMatches} / {result.totalMatches}
            </span>
            <span className="font-medium text-primary-600">{completionPct}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${completionPct}%`,
                backgroundColor: completionPct === 100 ? '#059669' : '#6366f1',
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Round-robin result card ----------

function RoundRobinCard({ event, draw, matches, entries, players, onExcel, onJpeg }: {
  event: Event;
  draw: Draw;
  matches: Match[];
  entries: Entry[];
  players: Player[];
  onExcel: () => void;
  onJpeg: () => void;
}) {
  const analysis = useMemo(
    () => analyzeRoundRobin(draw, matches, entries, players),
    [draw, matches, entries, players]
  );
  const completionPct = analysis.totalMatches > 0
    ? Math.round((analysis.finishedMatches / analysis.totalMatches) * 100)
    : 0;

  const rankBg = (rank: number) => {
    if (rank === 1) return 'bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200';
    if (rank === 2) return 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200';
    if (rank === 3) return 'bg-gradient-to-r from-orange-50/50 to-amber-50/30 border-orange-200/60';
    return 'bg-white border-gray-100';
  };

  const rankEmoji = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `${rank}`;
  };

  return (
    <section className="bg-white rounded-xl card-tottori overflow-hidden">
      {/* header */}
      <div className="bg-primary-50 px-4 py-3 border-b border-border-main flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary-500" />
          <h2 className="font-semibold text-primary-600">{event.name}</h2>
          <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded-full border border-border-main">
            リーグ戦
          </span>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={onExcel}
            className="flex items-center gap-1 bg-teal-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-teal-700 shadow-sm transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel
          </button>
          <button
            onClick={onJpeg}
            className="flex items-center gap-1 bg-orange-500 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-orange-600 shadow-sm transition-colors"
          >
            <Image className="w-3.5 h-3.5" />
            JPEG
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Standings table */}
        {analysis.standings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">順位</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">選手名</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">所属</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">勝</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">敗</th>
                </tr>
              </thead>
              <tbody>
                {analysis.standings.map((s, i) => (
                  <tr key={i} className={`border-b last:border-b-0 ${rankBg(s.rank)}`}>
                    <td className="px-3 py-2.5 font-medium">
                      <span className="text-base">{rankEmoji(s.rank)}</span>
                    </td>
                    <td className="px-3 py-2.5 font-bold text-gray-900">{s.name}</td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs">{s.affiliation}</td>
                    <td className="px-3 py-2.5 text-center font-semibold text-green-600">{s.wins}</td>
                    <td className="px-3 py-2.5 text-center font-semibold text-red-500">{s.losses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center text-gray-400 text-sm py-4">
            まだ結果が確定していません
          </div>
        )}

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              試合数: {analysis.finishedMatches} / {analysis.totalMatches}
            </span>
            <span className="font-medium text-primary-600">{completionPct}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${completionPct}%`,
                backgroundColor: completionPct === 100 ? '#059669' : '#6366f1',
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

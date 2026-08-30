import React from 'react';
import { Trophy, Play } from 'lucide-react';
import type { DrawSlotData, MatchResult } from '../draw/DrawBoard';
import { parseScoreParts } from '../score/scoreDisplay';
import { pairDisplayLines } from '../draw/pairLabel';

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
  /** 空きコートに入れる（enterCourtName付きの待機試合）ノードのクリックでコート投入 */
  onEnterCourt?: (round: number, position: number) => void;
  /**
   * 表示を開始する回戦（0 = 1回戦の選手一覧から表示）。
   * 1以上を指定すると、それより前の回戦を隠して残りを詰めて描画する。
   * 回戦が進むほど対戦相手同士が上下に離れて見にくくなるのを防ぐ。
   */
  startRound?: number;
  /**
   * あたり修正モード。1回戦の枠（BYEの空き枠を含む）をタップで選び、
   * もう一方をタップすると入れ替える。試合ノードのタップは無効になる。
   */
  editMode?: boolean;
  /** 修正モードで選択中の枠の position */
  selectedSlotPosition?: number | null;
  /** 修正モードで枠がタップされたとき */
  onSlotSelect?: (position: number) => void;
  /**
   * 名前修正モード。1回戦の枠をタップすると選手名の修正を開く。
   * （あたり修正モードとは別で、枠の入れ替えは行わない）
   */
  nameEditMode?: boolean;
}

const SLOT_HEIGHT = 36;
// ダブルスはペアを1人ずつ2行（氏名＋所属）で表示するので枠を高くする。
const SLOT_HEIGHT_DOUBLES = 52;
const Y_SPACING = 64;
const Y_SPACING_DOUBLES = 80;
const OFFSET_Y = 40;
// vs表示（両者確定）のカードは氏名＋所属を上下2段で表示するため背が高い。
// コート番号を左側に大きく表示し、氏名・所属も読みやすい大きさにするため背を高くする。
const CARD_H_VS = 66;
// ダブルスは1組が2行になるので、vsカードは合計4行ぶんの高さが要る。
const CARD_H_VS_DOUBLES = 96;

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
  onEnterCourt,
  startRound = 0,
  editMode = false,
  selectedSlotPosition = null,
  onSlotSelect,
  nameEditMode = false,
}: CourtBracketViewProps) {
  const isMobile = useIsMobile();
  const isDoubles = eventType === 'Doubles';
  // ダブルスはペアを1人ずつ2行で書くため、枠・間隔・カード高さを1段大きくする。
  const slotH = isDoubles ? SLOT_HEIGHT_DOUBLES : SLOT_HEIGHT;
  const ySpacing = isDoubles ? Y_SPACING_DOUBLES : Y_SPACING;
  const cardHVs = isDoubles ? CARD_H_VS_DOUBLES : CARD_H_VS;
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

  /**
   * その枝（回戦 r・位置 i の配下）が全て BYE か。
   * BYE だけの枝は紙のトーナメント表と同じく線も枠も描かない。
   * これを見ないと、空の枝にも枠が描かれて実際の対戦カードとずれて見える。
   */
  const emptyCache = new Map<string, boolean>();
  const isEmptySubtree = (r: number, i: number): boolean => {
    if (r <= 0) return isSlotBye(i);
    const key = `${r}-${i}`;
    const hit = emptyCache.get(key);
    if (hit !== undefined) return hit;
    const v = isEmptySubtree(r - 1, i * 2) && isEmptySubtree(r - 1, i * 2 + 1);
    emptyCache.set(key, v);
    return v;
  };

  // 表示の起点となる回戦（最低でも2列は残す）
  const leafRound = Math.min(Math.max(Math.floor(startRound), 0), Math.max(0, roundsCount - 1));

  // --- コンパクトY位置 ---
  // leafRound の列を「葉」として詰め、それ以降は子の中点に配置する。
  const leafCount = drawSize / Math.pow(2, leafRound);
  const leafY: number[] = new Array(leafCount).fill(0);
  let nextCompactY = OFFSET_Y;

  if (leafRound === 0) {
    for (let matchIdx = 0; matchIdx < drawSize / 2; matchIdx++) {
      const topIdx = matchIdx * 2;
      const botIdx = matchIdx * 2 + 1;
      const topBye = isSlotBye(topIdx);
      const botBye = isSlotBye(botIdx);

      if (matchIdx === halfSize / 2 && nextCompactY > OFFSET_Y) {
        nextCompactY += ySpacing * 0.8;
      }

      // 修正モードでは空き枠も入れ替え先として並べるので、全ての枠に行を割り当てる。
      // 2回戦の相手が決まる「4枠ずつのまとまり」が分かるよう、2試合ごとに余白を空ける。
      if (editMode) {
        const EDIT_SPACING = slotH + 10;
        if (matchIdx > 0 && matchIdx % 2 === 0) nextCompactY += 18;
        leafY[topIdx] = nextCompactY;
        leafY[botIdx] = nextCompactY + EDIT_SPACING;
        nextCompactY += EDIT_SPACING * 2 + 8;
        continue;
      }

      if (topBye && botBye) {
        leafY[topIdx] = nextCompactY;
        leafY[botIdx] = nextCompactY;
      } else if (topBye) {
        leafY[topIdx] = nextCompactY;
        leafY[botIdx] = nextCompactY;
        nextCompactY += ySpacing;
      } else if (botBye) {
        leafY[topIdx] = nextCompactY;
        leafY[botIdx] = nextCompactY;
        nextCompactY += ySpacing;
      } else {
        leafY[topIdx] = nextCompactY;
        leafY[botIdx] = nextCompactY + ySpacing;
        nextCompactY += ySpacing * 2;
      }
    }
  } else {
    // 隠した回戦の分だけ縦に詰める。先頭列は対戦カード（背の高いvs表示）に
    // なりうるので、カード高さ分の間隔を確保する。
    const LEAF_SPACING = cardHVs + 16;
    for (let i = 0; i < leafCount; i++) {
      // 上半分と下半分の間に軽い区切りを入れる
      if (i > 0 && i === leafCount / 2) nextCompactY += LEAF_SPACING * 0.4;
      leafY[i] = nextCompactY;
      nextCompactY += LEAF_SPACING;
    }
  }

  const getCompactY = (r: number, i: number): number => {
    if (r <= leafRound) return leafY[i] ?? OFFSET_Y;
    const a = getCompactY(r - 1, i * 2);
    const b = getCompactY(r - 1, i * 2 + 1);
    // 片方が BYE だけの枝なら、もう片方のラインをそのまま通す
    // （中点にすると、実際の対戦相手のいない側へ枠がずれてしまう）
    const ea = isEmptySubtree(r - 1, i * 2);
    const eb = isEmptySubtree(r - 1, i * 2 + 1);
    if (ea && !eb) return b;
    if (eb && !ea) return a;
    return (a + b) / 2;
  };
  const getX = (r: number) => offsetX + (r - leafRound) * (slotW + xSpacing);

  const visibleColumns = roundsCount - leafRound;
  const containerWidth = offsetX * 2 + visibleColumns * (slotW + xSpacing) + slotW;
  const baseHeight = nextCompactY + slotH + OFFSET_Y;

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

  /**
   * 氏名＋所属の表示ブロック。
   * ダブルスは「A / B」をペアの1人ずつ2行に分け、所属もその行の右に並べる。
   * 2人が同じ所属で1つしか入っていないときは、2行の縦中央に1つだけ置く。
   * シングルスはこれまで通り「氏名（左）＋所属（右）」の1行。
   */
  const nameBlock = (
    name: string,
    affiliation: string,
    opt: { nameCls: string; affCls: string },
  ) => {
    const { names, affiliations } = isDoubles
      ? pairDisplayLines(name, affiliation)
      : { names: [name], affiliations: affiliation ? [affiliation] : [] };
    const multi = names.length > 1;
    return (
      <div className="flex-1 flex items-center gap-1.5 min-w-0">
        <div className="flex-1 min-w-0 leading-tight">
          {names.map((n, i) => (
            <div key={i} className={`truncate ${opt.nameCls}`} title={n}>{n}</div>
          ))}
        </div>
        {affiliations.length > 0 && (
          <div className={`leading-tight text-right ${multi ? 'shrink min-w-0 max-w-[46%]' : 'shrink-0'}`}>
            {affiliations.map((a, i) => (
              <div
                key={i}
                className={`${multi ? 'truncate' : 'whitespace-nowrap'} ${opt.affCls}`}
                title={a}
              >
                {a}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // --- 回戦ヘッダー ---
  const roundHeaders: React.ReactNode[] = [];
  for (let r = leafRound; r <= roundsCount; r++) {
    const x = getX(r);
    // 各列には「その回戦の試合」が並ぶので、列の見出しはその回戦名にする。
    // （r+1 にすると、準決勝の対戦カードが「決勝」の下に並んでしまう）
    // 左端の選手一覧の列は回戦ではないので「選手」とする。
    const displayLabel = r === 0 ? '選手' : getRoundName(r, totalRounds);
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
  for (let r = leafRound; r < roundsCount; r++) {
    const numMatches = drawSize / Math.pow(2, r + 1);
    for (let m = 0; m < numMatches; m++) {
      const x = getX(r) + slotW;
      const xNext = getX(r + 1);
      const xMid = (x + xNext) / 2;

      const yTop = getCompactY(r, m * 2) + slotH / 2;
      const yBottom = getCompactY(r, m * 2 + 1) + slotH / 2;
      const yMid = getCompactY(r + 1, m) + slotH / 2;

      // BYE だけの枝は描かず、相手のラインをそのまま次の回戦へ通す（全回戦共通）
      const topEmpty = isEmptySubtree(r, m * 2);
      const botEmpty = isEmptySubtree(r, m * 2 + 1);
      if (topEmpty && botEmpty) continue;
      if (topEmpty || botEmpty) {
        const playerY = topEmpty ? yBottom : yTop;
        paths.push(
          <path key={`r${r}-m${m}-bye`} d={`M ${x} ${playerY} L ${xNext} ${playerY}`}
            fill="none" stroke="#a6a6a6" strokeWidth="1" />
        );
        continue;
      }

      const matchResult = findMatch(r + 1, m + 1);
      const isFinished = matchResult && (matchResult.status === 'finished' || matchResult.status === 'walkover');
      const isPlaying = matchResult?.status === 'playing';
      const winnerIsTop = isFinished && matchResult.winnerEntryId === matchResult.player1EntryId;
      const winnerIsBottom = isFinished && matchResult.winnerEntryId === matchResult.player2EntryId;

      // 勝者の線はブランド赤。線自体は点滅させない（点滅はカードのみ）。
      const getStroke = (isWinner: boolean) => isWinner ? '#ad2c29' : isPlaying ? '#c63834' : '#a6a6a6';
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
        fill="none" stroke={winnerExists ? '#ad2c29' : isPlaying ? '#c63834' : '#a6a6a6'}
        strokeWidth={winnerExists ? '2.5' : '1'} strokeLinecap="round" />);

      // 結果（スコア）を線が合流する付近に上下に並べて表示（手書きスケッチ準拠）。
      // 上側=player1のスコアは合流点の上、下側=player2のスコアは下に配置。勝者側は赤ピル。
      if (isFinished && matchResult.score) {
        const raw = matchResult.score.trim();
        // タイブレークの得点は落とした側に "6(4)" のように付き、Ret / W.O は注記として分かれる
        const parts = parseScoreParts(raw);
        const scoreX = (xMid + xNext) / 2; // 合流後の横線の中央付近
        if (parts?.hasGames) {
          const topWin = !!winnerIsTop;
          const botWin = !!winnerIsBottom;
          // 文字数に合わせてピルを広げる（"6(4)" や "6 4" でも欠けないように）
          const pillW = (val: string) => Math.max(20, val.length * 7.5 + 8);
          const maxW = Math.max(pillW(parts.p1), pillW(parts.p2));
          // 次の回戦のカードに重ならないよう、右端を少し内側に留める
          const cx = Math.min(scoreX, xNext - 4 - maxW / 2);
          const pill = (key: string, cy: number, val: string, win: boolean) => {
            const w = pillW(val), h = 16;
            return (
              <g key={key}>
                <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={7}
                  fill={win ? '#ad2c29' : '#ffffff'} stroke={win ? '#ad2c29' : '#d6d6d6'} strokeWidth="1" />
                <text x={cx} y={cy + 4.5} fill={win ? '#ffffff' : '#767676'}
                  fontSize={val.length > 3 ? 10 : 13} fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                  {val}
                </text>
              </g>
            );
          };
          // 合流点(yMid)を挟んで上に上側選手のスコア、下に下側選手のスコア
          paths.push(pill(`sT-${r}-${m}`, yMid - 11, parts.p1, topWin));
          paths.push(pill(`sB-${r}-${m}`, yMid + 11, parts.p2, botWin));
        }
        // Ret / W.O は棄権した側（敗者側）の横線上に表示する。
        // スコアがある途中棄権（"4-6 Ret"）でもゲームスコアと一緒に出す。
        const note = parts ? parts.note : raw;
        if (note) {
          const loserY = winnerIsTop ? yBottom : yTop; // 勝者でない側
          const loserFeederMidX = (x + xMid) / 2;
          const w = Math.max(26, note.length * 7 + 10);
          paths.push(
            <g key={`sX-${r}-${m}`}>
              <rect x={loserFeederMidX - w / 2} y={loserY - 8} width={w} height={16} rx={7}
                fill="#ffffff" stroke="#e49f9c" strokeWidth="1" />
              <text x={loserFeederMidX} y={loserY + 4} fill="#ad2c29"
                fontSize="10" fontWeight="bold" textAnchor="middle">
                {note}
              </text>
            </g>
          );
        }
      }

      // 対戦カード下部の時間表示。試合中は経過時間のみ（開始時刻は出さない）、
      // それ以外は開始時刻(予定)を表示する。カード高さ（vsは背高）に合わせて位置調整。
      const nextBothPlayers = !!(matchResult?.player1Name && matchResult?.player2Name);
      const nextIsVs = nextBothPlayers && !isFinished;
      const nextCardH = nextIsVs ? cardHVs : slotH;
      const cardCenterX = xNext + slotW / 2;
      const cardBottomY = getCompactY(r + 1, m) + (slotH + nextCardH) / 2 + 10;
      // 開始時刻（scheduledTime）はドロー表には既定で表示しない（「9:00」等の既定値を出さない）。
      // 試合中のみ経過時間を表示する。
      const bottomText = isPlaying
        ? (matchResult?.updatedAt ? formatElapsed(matchResult.updatedAt) : '')
        : '';
      if (bottomText) {
        paths.push(
          <text key={`bt-${r}-${m}`} x={cardCenterX} y={cardBottomY}
            fill={isPlaying ? '#ad2c29' : '#262626'}
            fontSize="8.5" fontWeight="bold" textAnchor="middle">
            {bottomText}
          </text>
        );
      }
    }
  }

  // --- 1回戦スロット（回戦を隠しているときは表示しない）---
  const slotElements: React.ReactNode[] = [];
  let visibleIndex = 0;
  for (let i = 0; leafRound === 0 && i < drawSize; i++) {
    const slot = slots[i];
    const isEmpty = !slot || (slot.isBye && !slot.entryId);
    // 修正モードでは空き枠（BYE）も入れ替え先として表示する
    if (isEmpty && !editMode) continue;
    if (!slot) continue;
    if (!isEmpty) visibleIndex++;
    const x = getX(0);
    const y = leafY[i];
    const isSelected = editMode && selectedSlotPosition === slot.position;
    // 名前修正モードでは、選手の入っている枠だけタップできる
    const nameEditable = nameEditMode && !isEmpty;
    const editProps = (editMode || nameEditable) && onSlotSelect
      ? { onClick: () => onSlotSelect(slot.position), role: 'button' as const }
      : {};
    const editCls = editMode
      ? isSelected
        ? ' ring-2 ring-primary-500 bg-primary-50 cursor-pointer'
        : ' cursor-pointer hover:ring-2 hover:ring-primary-200'
      : nameEditable
        ? ' cursor-pointer hover:ring-2 hover:ring-primary-300'
        : '';

    slotElements.push(
      <div key={`s-${slot.position}`}
        {...editProps}
        className={`absolute flex items-center px-1.5 gap-1 border rounded select-none transition-all${editCls} ${
          isEmpty ? 'bg-gray-50 border-dashed border-gray-300' : 'bg-white border-gray-400'
        }`}
        style={{ left: x, top: y, width: slotW, height: slotH }}
      >
        <div className="w-5 text-[10px] font-mono font-bold text-gray-600 border-r border-gray-300 pr-1 text-center shrink-0">
          {editMode ? slot.position : visibleIndex}
        </div>
        {slot.seed > 0 && (
          <div className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center bg-primary-100 text-gray-800 text-[8px] font-bold rounded-full">
            {slot.seed}
          </div>
        )}
        {isEmpty ? (
          <div className="flex-1 truncate text-[13px] text-gray-400">空き</div>
        ) : slot.isBye ? (
          <div className="flex-1 truncate text-[13px] text-gray-400">BYE</div>
        ) : (
          nameBlock(slot.name, slot.affiliation, {
            nameCls: 'font-semibold text-gray-900 text-[13px]',
            affCls: 'text-[10px] text-gray-500',
          })
        )}
      </div>
    );
  }

  // 対戦カード（vs）用の選手1行：番号＋フルネームと所属。
  // シングルスは氏名の下に所属、ダブルスはペアを1人ずつ2行にして各行の右に所属を出す。
  const playerRow = (entryId: string | null, name: string, key: string, dim: boolean) => {
    const full = numberedFullName(entryId, name);
    const aff = affiliationOf(entryId);
    const nameCls = `text-[13px] font-bold ${dim ? 'text-gray-600' : 'text-gray-900'}`;
    if (isDoubles) {
      return (
        <div key={key} className="flex min-w-0">
          {nameBlock(full || '—', aff, { nameCls, affCls: 'text-[10px] text-gray-500' })}
        </div>
      );
    }
    return (
      <div key={key} className="min-w-0 leading-tight">
        <div className={`truncate ${nameCls}`} title={full}>
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
    const bg = tone === 'playing' ? 'bg-primary-600' : tone === 'ready' ? 'bg-gray-600' : 'bg-gray-400';
    return (
      <div className={`flex flex-col items-center justify-center shrink-0 text-white ${bg}`} style={{ width: 42 }}>
        <span className="text-[8px] font-bold leading-none opacity-85">コート</span>
        <span className="text-2xl font-black leading-none mt-0.5">{num}</span>
      </div>
    );
  };

  // 控え（順番待ち）を左端にグレーで表示（対戦順シートと共通の控え番号）
  const standbyColumn = (label: string) => {
    const num = label.match(/(\d+)/)?.[1] ?? '';
    return (
      <div className="flex flex-col items-center justify-center shrink-0 text-white bg-gray-400" style={{ width: 42 }}>
        <span className="text-[8px] font-bold leading-none opacity-85">控え</span>
        <span className="text-xl font-black leading-none mt-0.5">{num}</span>
      </div>
    );
  };

  // 空きコートが出て入れる状態の左端。どのコートに入れるかはタップ後に選ぶので、
  // コート番号は表示しない（運営＝赤でタップしてコート選択、観戦用＝グレーの案内）。
  const enterColumn = (interactive: boolean) => (
    <div
      className={`flex flex-col items-center justify-center shrink-0 text-white ${interactive ? 'bg-primary-600' : 'bg-gray-600'}`}
      style={{ width: 42 }}
    >
      {interactive ? (
        <>
          <Play className="w-4 h-4" />
          <span className="text-[8px] font-bold leading-none opacity-90 mt-0.5">コート</span>
          <span className="text-[8px] font-bold leading-none opacity-90">選択</span>
        </>
      ) : (
        <>
          <span className="text-[9px] font-bold leading-none opacity-90">次に</span>
          <span className="text-[9px] font-bold leading-none opacity-90 mt-0.5">入ります</span>
        </>
      )}
    </div>
  );

  // --- 対戦ノード（2回戦以降・3位決定戦）---
  const matchElements: React.ReactNode[] = [];

  /**
   * 1つの対戦ノードを描く。
   * 通常のトーナメントの枠と、決勝の下に置く3位決定戦の枠で共通に使う。
   */
  const renderMatchNode = (
    key: string,
    matchResult: MatchResult | undefined,
    x: number,
    y: number,
    opts: { isFinal?: boolean; emptyLabel?: string } = {},
  ): React.ReactNode => {
    {
      const isFinal = !!opts.isFinal;
      const isFinished = matchResult && (matchResult.status === 'finished' || matchResult.status === 'walkover');
      const isPlaying = matchResult?.status === 'playing';
      const isReady = matchResult?.status === 'ready';
      const bothPlayers = !!(matchResult?.player1Name && matchResult?.player2Name);
      const isVs = bothPlayers && !isFinished; // 両者確定・未確定 → vs 表示（背高カード）

      // カード高さ：vs表示のみ氏名＋所属を2段で見せるため背を高くし、
      // 取り付き位置（中心）は slotH 基準の合流点に合わせる。
      const cardH = isVs ? cardHVs : slotH;
      const top = y + (slotH - cardH) / 2;

      // 空きコートに入れる状態（enterCourtName付き・未試合）は、タップでコート投入。
      const isEnterable = !!(matchResult?.enterCourtName && bothPlayers && !isPlaying && !isFinished);
      // クリック動作: 入れる状態なら onEnterCourt、それ以外は onMatchSelect（スコア入力）
      // 修正モード中はスコア入力・コート投入のタップを止める（枠の入れ替えに専念）
      const clickHandler = editMode
        ? null
        : isEnterable && onEnterCourt
          ? () => onEnterCourt(matchResult!.round, matchResult!.position)
          : (onMatchSelect && bothPlayers)
            ? () => onMatchSelect(matchResult!.round, matchResult!.position)
            : null;
      const clickProps = clickHandler ? { onClick: clickHandler, role: 'button' as const } : {};
      const clickCls = clickHandler
        ? (isEnterable && onEnterCourt ? ' cursor-pointer hover:ring-2 hover:ring-primary-400' : ' cursor-pointer hover:ring-2 hover:ring-gray-400')
        : '';

      // 枠の配色（点滅は枠のみ・カード内はそのまま = bracket-card-blink）
      // 控え1〜5は淡いグレー枠点滅（順番待ち）、空きコートが出て入れる状態は濃い墨の枠点滅。
      const isStandby = !!(matchResult?.standbyLabel && bothPlayers && !isPlaying && !isFinished);
      const cardClass = isFinished
        ? (isFinal ? 'border-2 border-primary-500 bg-primary-50' : 'border border-gray-400 bg-white')
        : isPlaying
          ? 'border-2 border-primary-500 bg-primary-50 bracket-card-blink'
          : isEnterable
            ? 'border-2 border-gray-700 bg-gray-50 enter-court-blink'
            : isStandby
              ? 'border-2 border-gray-400 bg-white enter-card-blink'
              : isReady
                ? 'border border-gray-400 bg-gray-50'
                : isVs
                  ? 'border border-gray-300 bg-white'
                  : `border border-dashed ${isFinal ? 'border-gray-400' : 'border-gray-300'} bg-white`;

      let content: React.ReactNode;
      if (isFinished) {
        // 勝者：番号＋フルネーム＋所属（ダブルスは1人ずつ2行）
        const winnerFull = numberedFullName(matchResult.winnerEntryId, getWinnerName(matchResult));
        const winnerAff = affiliationOf(matchResult.winnerEntryId);
        content = (
          <div className="flex items-center gap-1 w-full min-w-0 px-2">
            {isFinal && <Trophy className="w-4 h-4 text-primary-500 shrink-0" />}
            {nameBlock(winnerFull, winnerAff, {
              nameCls: isFinal
                ? 'text-[13px] font-bold text-primary-700'
                : 'text-[12px] font-semibold text-gray-800',
              affCls: 'text-[10px] text-gray-500',
            })}
          </div>
        );
      } else if (isVs) {
        // vs表示：実際に試合中のもののみ左端にコート番号を表示（控えは時間割上の仮割当のため非表示）。
        const dim = !isPlaying && !isReady;
        content = (
          <div className="flex items-stretch w-full h-full min-w-0">
            {isPlaying
              ? courtColumn(matchResult!.courtName, 'playing')
              : matchResult!.enterCourtName
                ? enterColumn(!!onEnterCourt)
                : matchResult!.standbyLabel
                  ? standbyColumn(matchResult!.standbyLabel)
                  : null}
            <div className="flex-1 flex flex-col justify-center min-w-0 px-2 gap-0.5">
              {playerRow(matchResult!.player1EntryId, matchResult!.player1Name, 'p1', dim)}
              <div className="border-t border-gray-200" />
              {playerRow(matchResult!.player2EntryId, matchResult!.player2Name, 'p2', dim)}
            </div>
          </div>
        );
      } else {
        // 選手未確定
        const emptyLabel = opts.emptyLabel ?? (isFinal ? '決勝' : '');
        content = (
          <div className="flex items-center gap-1 w-full min-w-0 px-2">
            {emptyLabel ? (
              <>
                {isFinal && <Trophy className="w-3.5 h-3.5 text-gray-300 shrink-0" />}
                <span className="text-[11px] text-gray-400 font-bold">{emptyLabel}</span>
              </>
            ) : (
              <span className="text-[11px] text-gray-400 truncate flex-1">&nbsp;</span>
            )}
          </div>
        );
      }

      return (
        <div key={key}
          {...clickProps}
          className={`absolute flex items-center overflow-hidden rounded transition-all${clickCls} ${cardClass}${
            // 修正モード中は「保存前の古い対戦」であることが分かるよう薄く表示する
            editMode ? ' opacity-40' : ''
          }`}
          style={{ left: x, top, width: slotW, height: cardH }}
        >
          {content}
        </div>
      );
    }
  };

  for (let r = Math.max(1, leafRound); r <= roundsCount; r++) {
    const numNodes = drawSize / Math.pow(2, r);
    for (let m = 0; m < numNodes; m++) {
      // BYE だけの枝には枠を描かない（実際の対戦カードと重なってずれて見えるため）
      if (isEmptySubtree(r, m)) continue;
      matchElements.push(
        renderMatchNode(`m-${r}-${m}`, findMatch(r, m + 1), getX(r), getCompactY(r, m), {
          isFinal: r === roundsCount,
        }),
      );
    }
  }

  // --- 3位決定戦（決勝の下に置く）---
  // 決勝と同じ回戦の position=2 に入っている。準決勝の敗者同士なので、
  // トーナメントの線とはつなげず独立した枠として描く。
  const thirdPlaceMatch = findMatch(roundsCount, 2);
  let thirdPlaceTop = 0;
  if (thirdPlaceMatch) {
    const finalY = getCompactY(roundsCount, 0);
    thirdPlaceTop = Math.max(finalY + cardHVs + 56, nextCompactY - cardHVs);
    matchElements.push(
      <div
        key="third-place-label"
        className="absolute text-[10px] font-bold text-gray-500 text-center"
        // カードは vs 表示のとき上に伸びる（中心を thirdPlaceTop に合わせる）ので、
        // その分を見込んで見出しを置く
        style={{ left: getX(roundsCount), top: thirdPlaceTop - cardHVs / 2 - 14, width: slotW }}
      >
        3位決定戦
      </div>,
    );
    matchElements.push(
      renderMatchNode('third-place', thirdPlaceMatch, getX(roundsCount), thirdPlaceTop, {
        emptyLabel: '3位決定戦',
      }),
    );
  }

  // 3位決定戦の枠が下にはみ出さないよう高さを確保する
  const containerHeight = thirdPlaceMatch
    ? Math.max(baseHeight, thirdPlaceTop + cardHVs + OFFSET_Y)
    : baseHeight;

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

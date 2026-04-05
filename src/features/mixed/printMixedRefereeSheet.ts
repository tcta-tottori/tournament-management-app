import type { MixedTeam, BracketMatch } from './types';

/**
 * ミックスダブルス審判用紙を印刷（B5横向き）
 * ユーザ指定の「正しい形式」に基づき、モダンでおしゃれなCSS Gridデザインを適用
 */
export function printMixedRefereeSheet(
  match: BracketMatch,
  allTeams: MixedTeam[],
  tournamentName: string,
  bracketLabel: string,
  roundLabel: string,
  gameRule: string,
  tournamentDate: string,
  courtName?: string,
  startTime?: string,
) {
  const team1 = allTeams.find(t => t.teamId === match.team1Id);
  const team2 = allTeams.find(t => t.teamId === match.team2Id);
  if (!team1 || !team2) return;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>審判用紙 - ${bracketLabel}</title>
<style>
  @page { size: B5 landscape; margin: 5mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Hiragino Sans', 'Inter', 'Noto Sans JP', 'MS PGothic', sans-serif;
    color: #111;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    width: 240mm;
    height: 166mm;
    page-break-after: always;
    overflow: hidden;
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .sheet:last-child { page-break-after: auto; }
  
  [contenteditable="true"] { outline: none; }
  [contenteditable="true"]:hover { background: #fffde7; cursor: text; }
  [contenteditable="true"]:focus { background: #fff9c4; outline: none; }
  @media print {
    [contenteditable="true"]:hover, [contenteditable="true"]:focus { background: transparent; }
    .toolbar { display: none !important; }
  }

  .toolbar {
    text-align: center; padding: 10px; background: #f5f5f5;
    border-bottom: 1px solid #ddd; font-family: sans-serif; margin-bottom: 15px;
  }
  .toolbar button {
    padding: 8px 24px; font-size: 14px; cursor: pointer;
    border: 1px solid #999; border-radius: 4px; background: #fff; margin: 0 4px;
  }
  .toolbar button:hover { background: #e0e0e0; }
  .toolbar .hint { font-size: 11px; color: #888; margin-top: 4px; }

  /* Header */
  .header {
    position: relative;
    margin-bottom: 10px;
    flex-shrink: 0;
  }
  .main-title {
    text-align: center;
    font-size: 34px;
    font-weight: bold;
    letter-spacing: 0.5em;
    font-family: 'MS PMincho', 'Hiragino Mincho Pro', serif;
  }
  .meta {
    display: flex;
    justify-content: flex-end;
    margin-top: -8px;
    font-size: 14px;
    gap: 40px;
  }
  
  /* Main Container */
  .main-box {
    flex: 1;
    border: 2px solid #333;
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  }
  
  /* Grid settings */
  .grid-row { display: grid; border-bottom: 1px solid #555; width: 100%; box-sizing: border-box; }
  .main-box > *:last-child { border-bottom: none; }
  
  /* Double border between row 2 and 3 */
  .double-border { border-bottom: 3px double #555; }
  
  /* Grid columns */
  .row-1 { grid-template-columns: 16% 34% 16% 34%; flex: 1.2; min-height: 0; }
  .row-2 { grid-template-columns: 16% 14% 14% 32% 10% 14%; flex: 1.2; min-height: 0; }
  .row-3 { grid-template-columns: 16% 10% 32% 10% 32%; flex: 1.2; min-height: 0; }
  .row-4 { grid-template-columns: 16% 42% 42%; flex: 2.8; min-height: 0; }
  
  /* Score row has No team vertical lines inside */
  .row-5 { grid-template-columns: 16% 84%; flex: 5; min-height: 0; }
  
  /* Cell base styling */
  .cell {
    display: flex; align-items: center; justify-content: center;
    border-right: 1px solid #555; padding: 4px; overflow: hidden;
  }
  .cell:last-child { border-right: none; }
  
  /* Stylish Label Cells */
  .cell.label {
    background-color: #F3F4F6;
    color: #1F2937;
    font-weight: 600; font-size: 15px;
    letter-spacing: 0.25em;
    font-family: 'Hiragino Sans', 'Inter', sans-serif;
  }
  
  /* Text styling */
  .val-text { width: 100%; text-align: center; white-space: nowrap; overflow: hidden; }
  .val-bold { font-size: 22px; font-weight: 500; font-family: 'MS PMincho', serif; }
  
  /* Row 3 (Entry No) */
  .entry-no { font-family: 'Times New Roman', serif; font-size: 18px; transform:translateY(2px); }
  .entry-val { font-size: 28px; font-family: 'Arial', sans-serif; font-weight: normal; }
  
  /* Row 4 (Players) */
  .players-cell {
    display: flex; flex-direction: column; justify-content: center;
    align-items: stretch; padding: 10px 10% !important; gap: 16px;
  }
  .player-row {
    display: flex; align-items: center; justify-content: flex-start;
  }
  .p-name {
    font-size: 20px; font-weight: 500;
    font-family: 'MS PMincho', 'Hiragino Mincho Pro', serif;
    white-space: nowrap; text-align: left; width: 55%; letter-spacing: 0.1em;
  }
  .p-affil {
    font-size: 14px; color: #111; white-space: nowrap; width: 45%; text-align: right; letter-spacing: 0.05em;
  }
  .p-affil-text {
    display: inline-block; min-width: 60px; text-align: center;
  }
  
  /* Score Area */
  .score-label { flex-direction: column; gap: 8px; justify-content: flex-end; padding-bottom: 20px; }
  .tb-label { font-size: 14px; font-weight: normal; letter-spacing: 0; }
  
  .score-area {
    position: relative;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .score-center-text {
    text-align: center; display: flex; flex-direction: column; align-items: center; gap: 15px;
  }
  .score-dash { font-size: 28px; letter-spacing: 2em; transform: translateX(1em); }
  .tb-brackets { font-size: 16px; }
  
  /* Footer */
  .footer { text-align: right; font-size: 12px; margin-top: 6px; flex-shrink: 0; }
</style>
</head><body>

<div class="toolbar">
  <button onclick="window.print()">🖨️ 印刷</button>
  <div class="hint">黄色い背景になる領域をクリックして内容を直接編集できます（印刷時にはこのボタンエリアは消えます）</div>
</div>

<div class="sheet">
  <div class="header">
    <div class="main-title">審　判　用　紙</div>
    <div class="meta">
      <div class="tour-name" contenteditable="true">${tournamentName || ''}</div>
      <div class="tour-date" contenteditable="true">${tournamentDate || ''}</div>
    </div>
  </div>

  <div class="main-box">
    <!-- Row 1 -->
    <div class="grid-row row-1">
      <div class="cell label">種　目</div>
      <div class="cell"><div class="val-text val-bold" contenteditable="true">${bracketLabel || ''}</div></div>
      <div class="cell label">回　戦</div>
      <div class="cell"><div class="val-text val-bold" contenteditable="true">${roundLabel || ''}</div></div>
    </div>
    
    <!-- Row 2 -->
    <div class="grid-row row-2 double-border">
      <div class="cell label">コートNo.</div>
      <div class="cell"><div class="val-text val-bold" contenteditable="true">${courtName || ''}</div></div>
      <div class="cell label">試合方法</div>
      <div class="cell" style="padding: 2px;">
        <div class="val-text" style="font-size: 13px; white-space: pre-wrap; line-height: 1.3;" contenteditable="true">${gameRule || ''}</div>
      </div>
      <div class="cell label">開始時間</div>
      <div class="cell"><div class="val-text val-bold" contenteditable="true">${startTime || ''}</div></div>
    </div>

    <!-- Row 3 -->
    <div class="grid-row row-3">
      <div class="cell label">エントリーNo.</div>
      <div class="cell"><div class="entry-no">No.</div></div>
      <div class="cell"><div class="entry-val" contenteditable="true">${team1.pairNumber || ''}</div></div>
      <div class="cell"><div class="entry-no">No.</div></div>
      <div class="cell"><div class="entry-val" contenteditable="true">${team2.pairNumber || ''}</div></div>
    </div>

    <!-- Row 4 -->
    <div class="grid-row row-4">
      <div class="cell label" style="letter-spacing: 0.1em;">選 手 氏 名</div>
      <div class="cell players-cell">
        <div class="player-row">
          <div class="p-name" contenteditable="true">${team1.male.name}</div>
          <div class="p-affil">（<span class="p-affil-text" contenteditable="true">${team1.male.affiliation}</span>）</div>
        </div>
        <div class="player-row">
          <div class="p-name" contenteditable="true">${team1.female.name}</div>
          <div class="p-affil">（<span class="p-affil-text" contenteditable="true">${team1.female.affiliation}</span>）</div>
        </div>
      </div>
      <div class="cell players-cell">
        <div class="player-row">
          <div class="p-name" contenteditable="true">${team2.male.name}</div>
          <div class="p-affil">（<span class="p-affil-text" contenteditable="true">${team2.male.affiliation}</span>）</div>
        </div>
        <div class="player-row">
          <div class="p-name" contenteditable="true">${team2.female.name}</div>
          <div class="p-affil">（<span class="p-affil-text" contenteditable="true">${team2.female.affiliation}</span>）</div>
        </div>
      </div>
    </div>

    <!-- Row 5 -->
    <div class="grid-row row-5">
      <div class="cell label score-label">
        <div>ス コ ア</div>
        <div class="tb-label">（ＴＢ）</div>
      </div>
      <div class="cell score-area">
        <div class="score-center-text">
          <div class="score-dash">―</div>
          <div class="tb-brackets">（<span contenteditable="true" style="min-width:40px; display:inline-block; outline:none; text-align:center;">　　</span>）</div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">鳥取市テニス協会</div>
</div>
</body></html>`;

  const win = window.open('', '_blank', 'width=900,height=650');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
  }
}

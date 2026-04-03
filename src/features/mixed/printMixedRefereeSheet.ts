import type { MixedTeam, BracketMatch } from './types';

/**
 * ミックスダブルス審判用紙を印刷（B5横向き）
 * 審判用紙.xlsx のレイアウトを忠実に再現し、contenteditable で手動編集可能にする
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

  // B5 landscape: 250mm x 176mm, margin 5mm → usable 240mm x 166mm
  // Excel: 38 columns (A-AL), Col A=3.29, rest default ~8.43
  const colA = (3.29 / 315.20 * 100).toFixed(3);
  const colN = (8.43 / 315.20 * 100).toFixed(3);

  const colgroup = `<colgroup>
    <col style="width:${colA}%">` +
    Array.from({ length: 37 }, () => `<col style="width:${colN}%">`).join('') +
    `</colgroup>`;

  // Row heights from Excel (in points)
  const rowHeights = [
    16.5, 21.0, 22.5,           // R1-R3
    18.75, 18.75, 18.75, 18.75, // R4-R7
    16.5, 16.5, 16.5, 16.5,     // R8-R11
    7.5,                         // R12 spacer
    18.75, 18.75,                // R13-R14
    16.5, 16.5, 16.5,           // R15-R17
    16.5, 16.5, 16.5,           // R18-R20
    15.75, 15.75, 15.75, 15.75, 15.75, // R21-R25
    17.25, 17.25, 17.25,        // R26-R28
    25.5,                        // R29
  ];
  const totalPt = rowHeights.reduce((a, b) => a + b, 0);
  const rh = rowHeights.map(h => (h / totalPt * 166).toFixed(2) + 'mm');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>審判用紙 - ${bracketLabel}</title>
<style>
  @page { size: B5 landscape; margin: 5mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'MS Gothic', 'MS ゴシック', 'Yu Gothic', 'Hiragino Sans', monospace;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    width: 240mm;
    height: 166mm;
    page-break-after: always;
    overflow: hidden;
    position: relative;
  }
  .sheet:last-child { page-break-after: auto; }
  .ref-table {
    width: 100%;
    height: 100%;
    table-layout: fixed;
    border-collapse: collapse;
  }
  .ref-table td {
    padding: 0;
    margin: 0;
    vertical-align: middle;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* Font families */
  .fg { font-family: 'MS Gothic', 'MS ゴシック', 'Yu Gothic', monospace; }
  .fp { font-family: 'MS PGothic', 'MS Pゴシック', 'Yu Gothic', sans-serif; }
  .ft { font-family: 'Times New Roman', serif; }
  /* Border helpers */
  .bt  { border-top: 1px solid #000; }
  .bb  { border-bottom: 1px solid #000; }
  .bl  { border-left: 1px solid #000; }
  .br  { border-right: 1px solid #000; }
  .bt2 { border-top: 2px solid #000; }
  .bb2 { border-bottom: 2px solid #000; }
  .bl2 { border-left: 2px solid #000; }
  .br2 { border-right: 2px solid #000; }
  /* Editable cell highlight on screen (not printed) */
  [contenteditable="true"] {
    outline: none;
    cursor: text;
  }
  [contenteditable="true"]:hover {
    background: #fffde7;
  }
  [contenteditable="true"]:focus {
    background: #fff9c4;
  }
  @media print {
    [contenteditable="true"]:hover,
    [contenteditable="true"]:focus {
      background: transparent;
    }
    .no-print { display: none !important; }
  }
  .toolbar {
    text-align: center;
    padding: 10px;
    background: #f5f5f5;
    border-bottom: 1px solid #ddd;
    font-family: sans-serif;
  }
  .toolbar button {
    padding: 8px 24px;
    font-size: 14px;
    cursor: pointer;
    border: 1px solid #999;
    border-radius: 4px;
    background: #fff;
    margin: 0 4px;
  }
  .toolbar button:hover { background: #e0e0e0; }
  .toolbar .hint {
    font-size: 11px;
    color: #888;
    margin-top: 4px;
  }
</style>
</head><body>
<div class="toolbar no-print">
  <button onclick="window.print()">🖨️ 印刷</button>
  <div class="hint">黄色いセルをクリックして内容を編集できます（名前・ゲーム数・コート等）</div>
</div>
<div class="sheet">
  <table class="ref-table">
    ${colgroup}

    <!-- Row 1-2: Title -->
    <tr style="height:${rh[0]};">
      <td colspan="38" rowspan="2"
          class="fg" style="text-align:center; font-size:32px; font-weight:bold; letter-spacing:0.5em; height:calc(${rh[0]} + ${rh[1]});">
        審　判　用　紙
      </td>
    </tr>
    <tr style="height:${rh[1]};"></tr>

    <!-- Row 3: Tournament name + Date -->
    <tr style="height:${rh[2]};">
      <td colspan="7" style="height:${rh[2]};"></td>
      <td colspan="23" class="fg bb2" style="text-align:center; font-size:14px;"
          contenteditable="true">${tournamentName}</td>
      <td colspan="8" class="fg bb2" style="text-align:right; font-size:14px; padding-right:4px;"
          contenteditable="true">${tournamentDate}</td>
    </tr>

    <!-- Row 4-7: 種目 + 回戦 -->
    <tr style="height:${rh[3]};">
      <td colspan="6" rowspan="4"
          class="fg bl2 bt2 br bb"
          style="text-align:center; font-size:16px; height:calc(${rh[3]} + ${rh[4]} + ${rh[5]} + ${rh[6]});">
        種　目
      </td>
      <td colspan="13" rowspan="4"
          class="fg bt2 br bb"
          style="text-align:center; font-size:24px; white-space:nowrap;"
          contenteditable="true">${bracketLabel}</td>
      <td colspan="6" rowspan="4"
          class="fg bt2 br bb"
          style="text-align:center; font-size:16px;">
        回　戦
      </td>
      <td colspan="13" rowspan="4"
          class="fg bt2 br2 bb"
          style="text-align:center; font-size:24px; font-weight:bold;"
          contenteditable="true">${roundLabel}</td>
    </tr>
    <tr style="height:${rh[4]};"></tr>
    <tr style="height:${rh[5]};"></tr>
    <tr style="height:${rh[6]};"></tr>

    <!-- Row 8-11: コート№ / 試合方法 / 開始時間 -->
    <tr style="height:${rh[7]};">
      <td colspan="6" rowspan="4"
          class="fg bl2 bt br bb2"
          style="text-align:center; font-size:16px; height:calc(${rh[7]} + ${rh[8]} + ${rh[9]} + ${rh[10]});">
        コート№
      </td>
      <td colspan="6" rowspan="4"
          class="fg bt br bb2"
          style="text-align:center; font-size:36px; font-weight:bold;"
          contenteditable="true">${courtName || ''}</td>
      <td colspan="5" rowspan="4"
          class="fg bt br bb2"
          style="text-align:center; font-size:16px;">
        試合方法
      </td>
      <td colspan="9" rowspan="4"
          class="fg bt br bb2"
          style="text-align:center; font-size:14px; white-space:pre-line; line-height:1.3;"
          contenteditable="true">${gameRule}</td>
      <td colspan="5" rowspan="4"
          class="fg bt br bb2"
          style="text-align:center; font-size:16px;">
        開始時間
      </td>
      <td colspan="7" rowspan="4"
          class="fg bt br2 bb2"
          style="text-align:center; font-size:22px; font-weight:bold;"
          contenteditable="true">${startTime || ''}</td>
    </tr>
    <tr style="height:${rh[8]};"></tr>
    <tr style="height:${rh[9]};"></tr>
    <tr style="height:${rh[10]};"></tr>

    <!-- Row 12: Spacer -->
    <tr style="height:${rh[11]};">
      <td colspan="38" style="height:${rh[11]};"></td>
    </tr>

    <!-- Row 13-14: エントリー№ -->
    <tr style="height:${rh[12]};">
      <td colspan="6" rowspan="2"
          class="fg bl2 bt2 br bb"
          style="text-align:center; font-size:14px; height:calc(${rh[12]} + ${rh[13]});">
        エントリー№
      </td>
      <td colspan="4" rowspan="2"
          class="ft bt2 bb bl"
          style="text-align:right; font-size:20px; padding-right:2px;">
        No.
      </td>
      <td colspan="12" rowspan="2"
          class="fp bt2 bb br"
          style="text-align:center; font-size:26px;"
          contenteditable="true">${team1.pairNumber}</td>
      <td colspan="4" rowspan="2"
          class="ft bt2 bb bl"
          style="text-align:right; font-size:20px; padding-right:2px;">
        No.
      </td>
      <td colspan="12" rowspan="2"
          class="fp bt2 bb br2"
          style="text-align:center; font-size:26px;"
          contenteditable="true">${team2.pairNumber}</td>
    </tr>
    <tr style="height:${rh[13]};"></tr>

    <!-- Row 15-17: 選手氏名 (男子) -->
    <tr style="height:${rh[14]};">
      <td colspan="6" rowspan="6"
          class="fg bl2 bt br bb"
          style="text-align:center; font-size:14px; height:calc(${rh[14]} + ${rh[15]} + ${rh[16]} + ${rh[17]} + ${rh[18]} + ${rh[19]});">
        選 手 氏 名
      </td>
      <!-- Team1 male name: G15:O17 -->
      <td colspan="9" rowspan="3"
          class="fp bt bl"
          style="text-align:center; font-size:20px; white-space:nowrap; height:calc(${rh[14]} + ${rh[15]} + ${rh[16]});"
          contenteditable="true">${team1.male.name}</td>
      <!-- ( -->
      <td colspan="1" rowspan="3"
          class="fp bt"
          style="text-align:center; font-size:16px;">
        (
      </td>
      <!-- Team1 male affiliation: Q15:U17 -->
      <td colspan="5" rowspan="3"
          class="fp bt"
          style="text-align:center; font-size:12px; white-space:nowrap;"
          contenteditable="true">${team1.male.affiliation}</td>
      <!-- ) -->
      <td colspan="1" rowspan="3"
          class="fp bt br"
          style="text-align:center; font-size:16px;">
        )
      </td>
      <!-- Team2 male name: W15:AE17 -->
      <td colspan="9" rowspan="3"
          class="fp bt bl"
          style="text-align:center; font-size:20px; white-space:nowrap;"
          contenteditable="true">${team2.male.name}</td>
      <!-- ( -->
      <td colspan="1" rowspan="3"
          class="fp bt"
          style="text-align:center; font-size:16px;">
        (
      </td>
      <!-- Team2 male affiliation: AG15:AK17 -->
      <td colspan="5" rowspan="3"
          class="fp bt"
          style="text-align:center; font-size:12px; white-space:nowrap;"
          contenteditable="true">${team2.male.affiliation}</td>
      <!-- ) -->
      <td colspan="1" rowspan="3"
          class="fp bt br2"
          style="text-align:center; font-size:16px;">
        )
      </td>
    </tr>
    <tr style="height:${rh[15]};"></tr>
    <tr style="height:${rh[16]};"></tr>

    <!-- Row 18-20: 選手氏名 (女子) -->
    <tr style="height:${rh[17]};">
      <!-- Team1 female name: G18:O20 -->
      <td colspan="9" rowspan="3"
          class="fp bl bb"
          style="text-align:center; font-size:20px; white-space:nowrap; vertical-align:top; padding-top:2px; height:calc(${rh[17]} + ${rh[18]} + ${rh[19]});"
          contenteditable="true">${team1.female.name}</td>
      <!-- ( -->
      <td colspan="1" rowspan="3"
          class="fp bb"
          style="text-align:center; font-size:16px; vertical-align:top;">
        (
      </td>
      <!-- Team1 female affiliation: Q18:U20 -->
      <td colspan="5" rowspan="3"
          class="fp bb"
          style="text-align:center; font-size:12px; vertical-align:top; white-space:nowrap;"
          contenteditable="true">${team1.female.affiliation}</td>
      <!-- ) -->
      <td colspan="1" rowspan="3"
          class="fp bb br"
          style="text-align:center; font-size:16px; vertical-align:top;">
        )
      </td>
      <!-- Team2 female name: W18:AE20 -->
      <td colspan="9" rowspan="3"
          class="fp bl bb"
          style="text-align:center; font-size:20px; white-space:nowrap; vertical-align:top; padding-top:2px;"
          contenteditable="true">${team2.female.name}</td>
      <!-- ( -->
      <td colspan="1" rowspan="3"
          class="fp bb"
          style="text-align:center; font-size:16px; vertical-align:top;">
        (
      </td>
      <!-- Team2 female affiliation: AG18:AK20 -->
      <td colspan="5" rowspan="3"
          class="fp bb"
          style="text-align:center; font-size:12px; vertical-align:top; white-space:nowrap;"
          contenteditable="true">${team2.female.affiliation}</td>
      <!-- ) -->
      <td colspan="1" rowspan="3"
          class="fp bb br2"
          style="text-align:center; font-size:16px; vertical-align:top;">
        )
      </td>
    </tr>
    <tr style="height:${rh[18]};"></tr>
    <tr style="height:${rh[19]};"></tr>

    <!-- Row 21-25: スコア -->
    <tr style="height:${rh[20]};">
      <td colspan="6" rowspan="5"
          class="fg bl2 bt br"
          style="text-align:center; font-size:14px; height:calc(${rh[20]} + ${rh[21]} + ${rh[22]} + ${rh[23]} + ${rh[24]});">
        ス　コ　ア
      </td>
      <!-- Score left: G21:U25 (cols 7-21, 15 cols) -->
      <td colspan="15" rowspan="5"
          class="fg bt bl br"
          style="text-align:center; font-size:24px;">
      </td>
      <!-- Dash: V21:W25 (cols 22-23, 2 cols) -->
      <td colspan="2" rowspan="5"
          class="fg bt"
          style="text-align:center; font-size:24px;">
        ―
      </td>
      <!-- Score right: X21:AL25 (cols 24-38, 15 cols) -->
      <td colspan="15" rowspan="5"
          class="fg bt bl br2"
          style="text-align:center; font-size:24px;">
      </td>
    </tr>
    <tr style="height:${rh[21]};"></tr>
    <tr style="height:${rh[22]};"></tr>
    <tr style="height:${rh[23]};"></tr>
    <tr style="height:${rh[24]};"></tr>

    <!-- Row 26-28: (TB) -->
    <tr style="height:${rh[25]};">
      <td colspan="6" rowspan="3"
          class="fg bl2 br bb2"
          style="text-align:center; font-size:14px; height:calc(${rh[25]} + ${rh[26]} + ${rh[27]});">
        （ＴＢ）
      </td>
      <!-- TB left: G26:S28 (cols 7-19, 13 cols) -->
      <td colspan="13" rowspan="3"
          class="fg bl bb2"
          style="height:calc(${rh[25]} + ${rh[26]} + ${rh[27]});">
      </td>
      <!-- ( : T26:U28 -->
      <td colspan="2" rowspan="3"
          class="fg bb2"
          style="text-align:center; font-size:12px;">
        （
      </td>
      <!-- TB value: V28:W28 - middle -->
      <td colspan="2" rowspan="3"
          class="fg bb2"
          style="text-align:center; font-size:12px;">
      </td>
      <!-- ) : X26:Y28 -->
      <td colspan="2" rowspan="3"
          class="fg bb2"
          style="text-align:center; font-size:12px;">
        ）
      </td>
      <!-- TB right: Z26:AL28 (cols 26-38, 13 cols) -->
      <td colspan="13" rowspan="3"
          class="fg bb2 br2"
          style="height:calc(${rh[25]} + ${rh[26]} + ${rh[27]});">
      </td>
    </tr>
    <tr style="height:${rh[26]};"></tr>
    <tr style="height:${rh[27]};"></tr>

    <!-- Row 29: Footer -->
    <tr style="height:${rh[28]};">
      <td colspan="25" style="height:${rh[28]};"></td>
      <td colspan="13"
          class="fg bt2"
          style="text-align:right; font-size:12px; padding-right:4px;">
        鳥取市テニス協会
      </td>
    </tr>
  </table>
</div>
</body></html>`;

  const win = window.open('', '_blank', 'width=900,height=650');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
  }
}

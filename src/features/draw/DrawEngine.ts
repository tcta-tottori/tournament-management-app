import type { Player } from '../../db/database';

export interface DrawEntry {
  position: number;      // 1-indexed (1 to drawSize)
  entryId: string | null;
  playerId: string | null;
  name: string;
  furigana: string;
  affiliation: string;
  points: number;
  seed: number;
  isBye: boolean;
  isEmpty: boolean;
}

// JTAシードルール (ドローサイズに対するシード数)
const SEED_RULES: Record<number, number> = {
  4: 0,
  8: 2,
  16: 4,
  32: 8,
  64: 16,
  128: 16,
};

// JTAシード枠の固定配置ポジション (1-indexed)
// seed1 = 1, seed2 = drawSize
const SEED_POSITIONS: Record<number, { seed3_4?: number[], seed5_8?: number[], seed9_16?: number[] }> = {
  16: { seed3_4: [5, 12] },
  32: { seed3_4: [9, 24], seed5_8: [8, 16, 17, 25] },
  64: { seed3_4: [17, 48], seed5_8: [16, 32, 33, 49], seed9_16: [8, 24, 25, 41, 40, 56, 57, 9] },
  128:{ seed3_4: [33, 96], seed5_8: [32, 64, 65, 97], seed9_16: [16, 48, 49, 81, 80, 112, 113, 17] },
};

export class DrawEngine {
  
  /**
   * エントリー数からドローサイズを計算 (2のべき乗)
   */
  static getDrawSize(entryCount: number): number {
    if (entryCount <= 4) return 4;
    if (entryCount <= 8) return 8;
    if (entryCount <= 16) return 16;
    if (entryCount <= 32) return 32;
    if (entryCount <= 64) return 64;
    return 128;
  }

  /**
   * 配列をシャッフル (Fisher-Yates)
   */
  static shuffle<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * 対戦相手のインデックス(0-indexed)を取得
   */
  static getOpponentIndex(index: number): number {
    return index % 2 === 0 ? index + 1 : index - 1;
  }

  /**
   * 選手情報を基にシードを割り当てる (ポイント順)
   */
  static assignSeeds(players: (Player & { entryId: string, points: number })[], drawSize: number) {
    const seedCount = SEED_RULES[drawSize] || 0;
    
    // ポイント降順でソート
    const sorted = [...players].sort((a, b) => b.points - a.points);
    const result = sorted.map((p) => ({ ...p, seed: 0 }));

    if (seedCount >= 1 && result.length >= 1) result[0].seed = 1;
    if (seedCount >= 2 && result.length >= 2) result[1].seed = 2;

    if (seedCount >= 4 && result.length >= 4) {
      const seeds34 = this.shuffle([3, 4]);
      result[2].seed = seeds34[0];
      result[3].seed = seeds34[1];
    } else if (seedCount >= 3 && result.length >= 3) {
      result[2].seed = 3;
    }

    if (seedCount >= 8 && result.length >= 8) {
      const seeds58 = this.shuffle([5, 6, 7, 8]);
      for (let i = 0; i < 4; i++) {
        result[4 + i].seed = seeds58[i];
      }
    }

    if (seedCount >= 16 && result.length >= 16) {
      const seeds916 = this.shuffle([9, 10, 11, 12, 13, 14, 15, 16]);
      for (let i = 0; i < 8; i++) {
        result[8 + i].seed = seeds916[i];
      }
    }

    return result;
  }

  /**
   * BYE位置を決定するロジック（シード対抗位置＋4分割ブロック均等配置）
   */
  static determineBYEPositions(
    drawSize: number, 
    seedPositionsMap: Map<number, number>, // 0-indexed position -> seed number
    byeCount: number
  ): number[] {
    if (byeCount <= 0) return [];
    
    const byePositions: number[] = [];
    const usedPositions = new Set<number>();
    
    // シード選手の情報を整理
    const seedEntries = Array.from(seedPositionsMap.entries()).map(([pos, seed]) => ({ pos, seed }));
    seedEntries.sort((a, b) => a.seed - b.seed);

    // 1. シード選手の対抗位置に優先的にBYEを入れる
    for (const se of seedEntries) {
      if (byePositions.length >= byeCount) break;
      const opponentPos = this.getOpponentIndex(se.pos);
      if (!seedPositionsMap.has(opponentPos) && !usedPositions.has(opponentPos)) {
        byePositions.push(opponentPos);
        usedPositions.add(opponentPos);
      }
    }

    // 2. 残りのBYEは、4つの山に均等になるように配置 (旧アルゴリズム踏襲・簡易版)
    const remainingByes = byeCount - byePositions.length;
    if (remainingByes > 0) {
      // 簡易版: 上端と下端から交互に空き位置を探してBYEを埋める
      let top = 0;
      let bottom = drawSize - 1;
      let fromTop = true;

      while (byePositions.length < byeCount) {
        if (fromTop) {
          while (top < drawSize && (usedPositions.has(top) || seedPositionsMap.has(top))) {
            top++;
          }
          if (top < drawSize) {
            byePositions.push(top);
            usedPositions.add(top);
            top++;
          }
        } else {
          while (bottom >= 0 && (usedPositions.has(bottom) || seedPositionsMap.has(bottom))) {
            bottom--;
          }
          if (bottom >= 0) {
            byePositions.push(bottom);
            usedPositions.add(bottom);
            bottom--;
          }
        }
        fromTop = !fromTop;
        if (top > drawSize && bottom < 0) break; // フェールセーフ
      }
    }

    return byePositions;
  }

  /**
   * 所属の重複チェック関数
   * ダブルスの結合所属「A-Team / B-Team」の場合、部分一致で判定する
   */
  static hasCommonAffiliation(aff1: string, aff2: string): boolean {
    if (!aff1 || !aff2) return false;
    // " / " で分割して各所属をチェック
    const parts1 = aff1.split(' / ').map(s => s.trim()).filter(Boolean);
    const parts2 = aff2.split(' / ').map(s => s.trim()).filter(Boolean);
    return parts1.some(p1 => parts2.some(p2 => p1 === p2));
  }

  /**
   * 同所属分離アルゴリズム (スワップ方式)
   * 1回戦で同じ所属の選手同士ができるだけ対戦しないように、位置をスワップする。
   */
  static applyAffiliationSeparation(draw: DrawEntry[]) {
    // 1回戦のペアは (0,1), (2,3) ...
    for (let i = 0; i < draw.length; i += 2) {
      const p1 = draw[i];
      const p2 = draw[i + 1];
      
      if (!p1 || !p2 || p1.isBye || p2.isBye || p1.isEmpty || p2.isEmpty) continue;
      
      // 同一所属かチェック（所属文字列の完全一致。空文字は別扱い）
      const aff1 = p1.affiliation.trim();
      const aff2 = p2.affiliation.trim();
      
      if (aff1 && this.hasCommonAffiliation(aff1, aff2)) {
        // 同一所属の対戦が見つかった場合、別のペアの非シード選手とスワップを試みる
        let swapped = false;
        
        // p2 を別の場所の選手とスワップする
        for (let j = 0; j < draw.length; j++) {
          // 同じペアやシード選手、BYEとは入れ替えない
          if (Math.floor(j / 2) === Math.floor(i / 2)) continue;
          
          const candidate = draw[j];
          if (candidate.isBye || candidate.isEmpty || candidate.seed > 0) continue;
          
          const opponentOfCandidate = draw[this.getOpponentIndex(j)];
          const candidateAff = candidate.affiliation.trim();
          const oppOfCandidateAff = opponentOfCandidate ? opponentOfCandidate.affiliation.trim() : '';

          // 入れ替えた結果、どちらのペアも同所属対戦にならないか確認
          if (!this.hasCommonAffiliation(candidateAff, aff1) && (oppOfCandidateAff === '' || !this.hasCommonAffiliation(aff2, oppOfCandidateAff))) {
            // スワップ実行 (positionは変更せず中身だけ入れ替え)
            const tempPos1 = p2.position;
            const tempPos2 = candidate.position;
            
            draw[i + 1] = { ...candidate, position: tempPos1 };
            draw[j] = { ...p2, position: tempPos2 };
            
            swapped = true;
            break;
          }
        }
        
        if (!swapped) {
          console.warn(`同所属分離に失敗しました: ${p1.name} vs ${p2.name} (${aff1})`);
        }
      }
    }
  }

  /**
   * ドロー骨組みを生成
   */
  static generateDraw(players: (Player & { entryId: string, points: number })[]): { draw: DrawEntry[], drawSize: number } {
    const drawSize = this.getDrawSize(players.length);
    const draw: DrawEntry[] = Array.from({ length: drawSize }, (_, i) => ({
      position: i + 1,
      entryId: null,
      playerId: null,
      name: '',
      furigana: '',
      affiliation: '',
      points: 0,
      seed: 0,
      isBye: true,
      isEmpty: true
    }));

    if (players.length === 0) return { draw, drawSize };

    // ポイントに基づいてシードを決定
    const withSeeds = this.assignSeeds(players, drawSize);
    
    // シード選手と非シード選手を分ける
    const seeded = withSeeds.filter(p => p.seed > 0).sort((a, b) => a.seed - b.seed);
    const unseeded = withSeeds.filter(p => p.seed === 0);

    const seedPositionsMap = new Map<number, number>(); // 0-indexed pos -> seed

    // シード配置用内部ヘルパー
    const placeSeed = (seedEntry: typeof seeded[0], zeroIndexedPos: number) => {
      draw[zeroIndexedPos] = {
        position: zeroIndexedPos + 1,
        entryId: seedEntry.entryId,
        playerId: seedEntry.playerId || null,
        name: seedEntry.name,
        furigana: seedEntry.furigana || '',
        affiliation: seedEntry.affiliation || '',
        points: seedEntry.points,
        seed: seedEntry.seed,
        isBye: false,
        isEmpty: false
      };
      seedPositionsMap.set(zeroIndexedPos, seedEntry.seed);
    };

    const seedCount = seeded.length;
    if (seedCount >= 1) placeSeed(seeded[0], 0);
    if (seedCount >= 2) placeSeed(seeded[1], drawSize - 1);

    if (seedCount >= 3) {
      const pos34 = SEED_POSITIONS[drawSize]?.seed3_4 || [];
      const shuffled34 = this.shuffle([...pos34]);
      if (shuffled34.length >= 2) {
        placeSeed(seeded[2], shuffled34[0] - 1);
        if (seedCount >= 4) placeSeed(seeded[3], shuffled34[1] - 1);
      }
    }

    if (seedCount >= 5) {
      const pos58 = SEED_POSITIONS[drawSize]?.seed5_8 || [];
      const shuffled58 = this.shuffle([...pos58]);
      for (let i = 0; i < Math.min(4, seedCount - 4); i++) {
        if (i < shuffled58.length) {
          placeSeed(seeded[4 + i], shuffled58[i] - 1);
        }
      }
    }

    if (seedCount >= 9) {
      const pos916 = SEED_POSITIONS[drawSize]?.seed9_16 || [];
      const shuffled916 = this.shuffle([...pos916]);
      for (let i = 0; i < Math.min(8, seedCount - 8); i++) {
        if (i < shuffled916.length && (8 + i) < seeded.length) {
          placeSeed(seeded[8 + i], shuffled916[i] - 1);
        }
      }
    }

    // BYE位置の決定
    const byeCount = drawSize - players.length;
    const byePositions = this.determineBYEPositions(drawSize, seedPositionsMap, byeCount);
    const byeSet = new Set(byePositions);

    for (const pos of byePositions) {
      draw[pos].isBye = true;
      draw[pos].isEmpty = false;
      draw[pos].name = 'BYE';
    }

    // 非シード選手のランダム配置
    const availablePositions: number[] = [];
    for (let i = 0; i < drawSize; i++) {
      if (!seedPositionsMap.has(i) && !byeSet.has(i)) {
        availablePositions.push(i);
      }
    }

    const shuffledUnseeded = this.shuffle(unseeded);
    for (let i = 0; i < shuffledUnseeded.length && i < availablePositions.length; i++) {
      const pos = availablePositions[i];
      const p = shuffledUnseeded[i];
      draw[pos] = {
        position: pos + 1,
        entryId: p.entryId,
        playerId: p.playerId || null,
        name: p.name,
        furigana: p.furigana || '',
        affiliation: p.affiliation || '',
        points: p.points,
        seed: 0,
        isBye: false,
        isEmpty: false
      };
    }

    // 空き枠（本来存在しないはずだがフェールセーフ）はisEmpty=trueになる
    
    // 同所属分離を適用
    this.applyAffiliationSeparation(draw);

    return { draw, drawSize };
  }
}

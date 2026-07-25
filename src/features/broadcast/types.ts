export interface MatchCall {
  id: number;
  eventName: string;
  round: string;
  numberA: number;
  nameA: string;
  affA: string;
  pairNameA?: string;
  pairAffA?: string;
  numberB: number;
  nameB: string;
  affB: string;
  pairNameB?: string;
  pairAffB?: string;
  // 苗字の読み（ひらがな）。表示は「漢字（かな）」、読み上げはかな。未指定なら漢字のまま。
  nameAReading?: string;
  nameBReading?: string;
  pairNameAReading?: string;
  pairNameBReading?: string;
  type: 'singles' | 'doubles';
  status: 'pending' | 'speaking' | 'done';
  courtNumber: string;
  startTime: string;
  calledAt?: Date;
}

export interface CallLogEntry {
  timestamp: Date;
  courtNumber: string;
  eventName: string;
  round: string;
  text: string;
  matchId: number;
}

export interface VoiceSettings {
  rate: number;
  pitch: number;
  volume: number;
  repeatCount: number;
}

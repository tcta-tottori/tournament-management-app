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

export type VoiceGender = 'male' | 'female';

export interface VoiceSettings {
  rate: number;
  pitch: number;
  volume: number;
  repeatCount: number;
  gender: VoiceGender;
}

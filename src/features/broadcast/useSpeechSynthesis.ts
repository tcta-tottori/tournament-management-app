import { useState, useCallback, useRef, useEffect } from 'react';
import type { VoiceSettings, VoiceGender } from './types';

const MAX_REPEATS = 2; // 最大繰り返し回数（初回を除く）

/** 利用可能な日本語音声を性別ごとに取得 */
function getJapaneseVoices(): { male: SpeechSynthesisVoice | null; female: SpeechSynthesisVoice | null } {
  const voices = speechSynthesis.getVoices();
  const jaVoices = voices.filter(v => v.lang === 'ja-JP' || v.lang === 'ja_JP');

  // 既知の男性音声キーワード
  const maleKeywords = ['male', 'otoya', 'keita', 'takumi', 'hiro', 'daichi', 'ken'];
  // 既知の女性音声キーワード
  const femaleKeywords = ['female', 'nanami', 'haruka', 'mizuki', 'o-ren', 'kyoko', 'mei', 'google'];

  let male: SpeechSynthesisVoice | null = null;
  let female: SpeechSynthesisVoice | null = null;

  // キーワードマッチで探す
  for (const v of jaVoices) {
    const nameLower = v.name.toLowerCase();
    if (!male && maleKeywords.some(k => nameLower.includes(k))) {
      male = v;
    }
    if (!female && femaleKeywords.some(k => nameLower.includes(k))) {
      female = v;
    }
  }

  // フォールバック: 2つ以上ある場合、最初を女性、2番目を男性として扱う
  if (!female && jaVoices.length > 0) {
    female = jaVoices[0];
  }
  if (!male && jaVoices.length > 1) {
    male = jaVoices[1];
  }
  // 1つしかない場合は両方同じ音声を使い、pitchで差をつける
  if (!male && jaVoices.length === 1) {
    male = jaVoices[0];
  }

  return { male, female };
}

function selectVoiceByGender(gender: VoiceGender): SpeechSynthesisVoice | null {
  const { male, female } = getJapaneseVoices();
  return gender === 'male' ? (male || female) : (female || male);
}

/** 性別に応じたピッチ補正値（同じ音声しかない場合の差別化用） */
function getGenderPitchOffset(gender: VoiceGender): number {
  const { male, female } = getJapaneseVoices();
  // 異なる音声が割り当てられている場合はピッチ補正不要
  if (male && female && male.name !== female.name) return 0;
  // 同じ音声の場合、男性は低め、女性は高めに補正
  return gender === 'male' ? -0.2 : 0.15;
}

export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<{ male: string; female: string }>({ male: '', female: '' });
  const cancelledRef = useRef(false);

  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        setVoicesLoaded(true);
        const { male, female } = getJapaneseVoices();
        setAvailableVoices({
          male: male?.name || '(なし)',
          female: female?.name || '(なし)',
        });
      }
    };
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, []);

  const speak = useCallback((text: string, settings: VoiceSettings, onComplete?: () => void) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    cancelledRef.current = false;
    setIsSpeaking(true);

    const voice = selectVoiceByGender(settings.gender);
    const pitchOffset = getGenderPitchOffset(settings.gender);

    // Chrome長文バグ対策：句点で分割
    const baseChunks = text.split('。').filter(s => s.trim()).map(s => s + '。');

    // 繰り返し用に「繰り返します。」を先頭に追加したチャンク
    const repeatChunks = ['繰り返します。', ...baseChunks];

    // 繰り返し回数は最大2回（初回含め計3回）に制限
    const effectiveRepeatCount = Math.min(settings.repeatCount, MAX_REPEATS + 1);

    let repeatCount = 0;

    function speakChunks() {
      // 初回はbaseChunks、繰り返し時はrepeatChunksを使用
      const chunks = repeatCount === 0 ? baseChunks : repeatChunks;
      let index = 0;

      function speakNext() {
        if (cancelledRef.current) {
          setIsSpeaking(false);
          return;
        }
        if (index >= chunks.length) {
          repeatCount++;
          if (repeatCount < effectiveRepeatCount) {
            // 繰り返し間ポーズ
            setTimeout(() => {
              if (!cancelledRef.current) speakChunks();
            }, 2000);
          } else {
            setIsSpeaking(false);
            onComplete?.();
          }
          return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[index]);
        utterance.lang = 'ja-JP';
        utterance.rate = settings.rate;
        utterance.pitch = Math.max(0.1, Math.min(2.0, settings.pitch + pitchOffset));
        utterance.volume = settings.volume;
        if (voice) utterance.voice = voice;
        utterance.onend = () => { index++; speakNext(); };
        utterance.onerror = () => { index++; speakNext(); };
        synth.speak(utterance);
      }

      speakNext();
    }

    speakChunks();
  }, []);

  const stop = useCallback(() => {
    cancelledRef.current = true;
    speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const testVoice = useCallback((settings: VoiceSettings) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const voice = selectVoiceByGender(settings.gender);
    const pitchOffset = getGenderPitchOffset(settings.gender);
    const genderLabel = settings.gender === 'male' ? '男性' : '女性';
    const utterance = new SpeechSynthesisUtterance(`${genderLabel}の音声テストです。放送コールシステムをご利用いただきありがとうございます。`);
    utterance.lang = 'ja-JP';
    utterance.rate = settings.rate;
    utterance.pitch = Math.max(0.1, Math.min(2.0, settings.pitch + pitchOffset));
    utterance.volume = settings.volume;
    if (voice) utterance.voice = voice;
    synth.speak(utterance);
  }, []);

  return { isSpeaking, voicesLoaded, availableVoices, speak, stop, testVoice };
}

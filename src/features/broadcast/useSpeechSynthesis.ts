import { useState, useCallback, useRef, useEffect } from 'react';
import type { VoiceSettings } from './types';

const MAX_REPEATS = 2; // 最大繰り返し回数（初回を除く）

/** 利用可能な日本語女性音声を取得 */
function getJapaneseFemaleVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  const jaVoices = voices.filter(v => v.lang === 'ja-JP' || v.lang === 'ja_JP');

  // 既知の女性音声キーワード（かわいらしい声質を優先）
  const femaleKeywords = ['nanami', 'haruka', 'mizuki', 'o-ren', 'kyoko', 'mei', 'google', 'female'];

  for (const v of jaVoices) {
    const nameLower = v.name.toLowerCase();
    if (femaleKeywords.some(k => nameLower.includes(k))) {
      return v;
    }
  }

  // フォールバック: 最初の日本語音声
  return jaVoices[0] || null;
}

export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const [voiceName, setVoiceName] = useState('');
  const cancelledRef = useRef(false);

  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        setVoicesLoaded(true);
        const voice = getJapaneseFemaleVoice();
        setVoiceName(voice?.name || '(なし)');
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

    const voice = getJapaneseFemaleVoice();

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
        // かわいらしい女性の声: ピッチを少し高めに設定
        utterance.pitch = Math.max(0.1, Math.min(2.0, settings.pitch + 0.25));
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
    const voice = getJapaneseFemaleVoice();
    const utterance = new SpeechSynthesisUtterance('音声テストです。放送コールシステムをご利用いただきありがとうございます。');
    utterance.lang = 'ja-JP';
    utterance.rate = settings.rate;
    utterance.pitch = Math.max(0.1, Math.min(2.0, settings.pitch + 0.25));
    utterance.volume = settings.volume;
    if (voice) utterance.voice = voice;
    synth.speak(utterance);
  }, []);

  return { isSpeaking, voicesLoaded, voiceName, speak, stop, testVoice };
}

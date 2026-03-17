import { useState, useCallback, useRef, useEffect } from 'react';
import type { VoiceSettings } from './types';

const MAX_REPEATS = 2; // 最大繰り返し回数（初回を除く）

function selectJapaneseVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  return (
    voices.find(v => v.name.includes('Google') && v.lang === 'ja-JP') ||
    voices.find(v => v.name.includes('Nanami')) ||
    voices.find(v => v.lang === 'ja-JP') ||
    voices[0] ||
    null
  );
}

export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) setVoicesLoaded(true);
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

    const voice = selectJapaneseVoice();

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
        utterance.pitch = settings.pitch;
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

  const testVoice = useCallback((rate: number) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const voice = selectJapaneseVoice();
    const utterance = new SpeechSynthesisUtterance('テスト。放送コールシステムの音声テストです。');
    utterance.lang = 'ja-JP';
    utterance.rate = rate;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    if (voice) utterance.voice = voice;
    synth.speak(utterance);
  }, []);

  return { isSpeaking, voicesLoaded, speak, stop, testVoice };
}

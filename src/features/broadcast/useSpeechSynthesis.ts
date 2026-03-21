import { useState, useCallback, useRef, useEffect } from 'react';
import type { VoiceSettings } from './types';

const MAX_REPEATS = 2; // 最大繰り返し回数（初回を除く）
/** チャンク間のポーズ（ms）— 自然な間を演出 */
const CHUNK_PAUSE_MS = 600;

/** 利用可能な日本語女性音声を取得 */
function getJapaneseFemaleVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  const jaVoices = voices.filter(v => v.lang === 'ja-JP' || v.lang === 'ja_JP');

  // 上品で自然な声質を優先するキーワード順（ニューラル音声を最優先）
  const preferredKeywords = ['nanami', 'kyoko', 'o-ren', 'haruka', 'sayaka', 'ayumi', 'mei', 'mizuki', 'google', 'female'];

  for (const keyword of preferredKeywords) {
    const found = jaVoices.find(v => v.name.toLowerCase().includes(keyword));
    if (found) return found;
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
            // 繰り返し間ポーズ（長め）
            setTimeout(() => {
              if (!cancelledRef.current) speakChunks();
            }, 2500);
          } else {
            setIsSpeaking(false);
            onComplete?.();
          }
          return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[index]);
        utterance.lang = 'ja-JP';
            utterance.rate = settings.rate;
        utterance.pitch = Math.max(0.1, Math.min(2.0, settings.pitch));
        utterance.volume = settings.volume;
        if (voice) utterance.voice = voice;

        utterance.onend = () => {
          index++;
          // チャンク間に自然なポーズを入れる（最後のチャンク以外）
          if (index < chunks.length) {
            setTimeout(() => speakNext(), CHUNK_PAUSE_MS);
          } else {
            speakNext();
          }
        };
        utterance.onerror = () => {
          index++;
          speakNext();
        };
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
    const utterance = new SpeechSynthesisUtterance('音声テストです。大会運営システムの音声コールをご利用いただきありがとうございます。');
    utterance.lang = 'ja-JP';
    utterance.rate = settings.rate;
    utterance.pitch = Math.max(0.1, Math.min(2.0, settings.pitch));
    utterance.volume = settings.volume;
    if (voice) utterance.voice = voice;
    synth.speak(utterance);
  }, []);

  return { isSpeaking, voicesLoaded, voiceName, speak, stop, testVoice };
}

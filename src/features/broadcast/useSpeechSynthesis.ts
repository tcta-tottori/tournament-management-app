import { useState, useCallback, useRef, useEffect } from 'react';
import type { VoiceSettings } from './types';

const MAX_REPEATS = 2; // 最大繰り返し回数（初回を除く）
/** チャンク間のポーズ（ms）— 自然な間を演出 */
const CHUNK_PAUSE_MS = 600;

/** 推奨音声キーワード（優先順） */
const PREFERRED_VOICES = [
  { key: 'kyoko', label: 'Kyoko（落ち着いた女性）' },
  { key: 'flo', label: 'Flo（明るい女性）' },
  { key: 'shelley', label: 'Shelley（柔らかい女性）' },
  { key: 'sandy', label: 'Sandy（はっきりした女性）' },
];

const VOICE_STORAGE_KEY = 'speech-voice-key';

/** キーワードで日本語音声を検索 */
function findJapaneseVoice(keyword: string): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  const jaVoices = voices.filter(v => v.lang === 'ja-JP' || v.lang === 'ja_JP');
  return jaVoices.find(v => v.name.toLowerCase().includes(keyword)) || null;
}

/** 利用可能な日本語音声を取得（保存された選択 or デフォルト） */
function getSelectedVoice(selectedKey: string): SpeechSynthesisVoice | null {
  // ユーザー選択の音声を検索
  const selected = findJapaneseVoice(selectedKey);
  if (selected) return selected;

  // フォールバック: 推奨リストの順で検索
  for (const pref of PREFERRED_VOICES) {
    const found = findJapaneseVoice(pref.key);
    if (found) return found;
  }

  // 最終フォールバック
  const voices = speechSynthesis.getVoices();
  const jaVoices = voices.filter(v => v.lang === 'ja-JP' || v.lang === 'ja_JP');
  return jaVoices[0] || null;
}

export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const [voiceName, setVoiceName] = useState('');
  const [selectedVoiceKey, setSelectedVoiceKeyState] = useState(
    () => localStorage.getItem(VOICE_STORAGE_KEY) || 'kyoko'
  );
  /** 利用可能な推奨音声リスト */
  const [availableVoices, setAvailableVoices] = useState<{ key: string; label: string }[]>([]);
  const cancelledRef = useRef(false);

  const setSelectedVoiceKey = useCallback((key: string) => {
    setSelectedVoiceKeyState(key);
    localStorage.setItem(VOICE_STORAGE_KEY, key);
    const voice = findJapaneseVoice(key);
    setVoiceName(voice?.name || key);
  }, []);

  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        setVoicesLoaded(true);
        // 利用可能な推奨音声を判定
        const available = PREFERRED_VOICES.filter(pref => findJapaneseVoice(pref.key));
        setAvailableVoices(available);
        const voice = getSelectedVoice(selectedVoiceKey);
        setVoiceName(voice?.name || '(なし)');
      }
    };
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, [selectedVoiceKey]);

  const speak = useCallback((text: string, settings: VoiceSettings, onComplete?: () => void) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    cancelledRef.current = false;
    setIsSpeaking(true);

    const savedKey = localStorage.getItem(VOICE_STORAGE_KEY) || 'kyoko';
    const voice = getSelectedVoice(savedKey);

    // Chrome長文バグ対策：句点で分割
    const baseChunks = text.split('。').filter(s => s.trim()).map(s => s + '。');

    // 繰り返し用に「繰り返します。」を先頭に追加したチャンク
    const repeatChunks = ['繰り返します。', ...baseChunks];

    // 繰り返し回数は最大2回（初回含め計3回）に制限
    const effectiveRepeatCount = Math.min(settings.repeatCount || 1, MAX_REPEATS + 1);

    let repeatCount = 0;

    function speakChunks() {
      const chunks = repeatCount === 0 ? baseChunks : repeatChunks;
      let index = 0;

      function speakNext() {
        if (cancelledRef.current) {
          // コンポーネントがアンマウントされている可能性があるため try-catch で囲む
          try { setIsSpeaking(false); } catch {}
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
            try { setIsSpeaking(false); } catch {}
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

    // Chrome: cancel() 直後の speak() が無視されるバグ対策として少し遅延
    setTimeout(() => {
      if (!cancelledRef.current) speakChunks();
    }, 50);
  }, []);

  const stop = useCallback(() => {
    cancelledRef.current = true;
    speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const testVoice = useCallback((settings: VoiceSettings) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const savedKey = localStorage.getItem(VOICE_STORAGE_KEY) || 'kyoko';
    const voice = getSelectedVoice(savedKey);
    const utterance = new SpeechSynthesisUtterance('試合のコールをします。音声テストです。');
    utterance.lang = 'ja-JP';
    utterance.rate = settings.rate;
    utterance.pitch = Math.max(0.1, Math.min(2.0, settings.pitch));
    utterance.volume = settings.volume;
    if (voice) utterance.voice = voice;
    synth.speak(utterance);
  }, []);

  return {
    isSpeaking, voicesLoaded, voiceName,
    selectedVoiceKey, setSelectedVoiceKey, availableVoices,
    speak, stop, testVoice,
  };
}

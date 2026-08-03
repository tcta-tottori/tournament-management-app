import { useEffect, useState } from 'react';

export interface VisualViewportRect {
  /** 実際に見えている高さ（ソフトキーボードが出ている間はその分だけ小さくなる） */
  height: number;
  /** 画面上端からのオフセット（iOS でページがせり上がった時に発生する） */
  offsetTop: number;
  /** ソフトキーボードが出ていると推定される状態 */
  keyboardOpen: boolean;
}

/** キーボードで隠れていない高さかどうかの判定しきい値(px) */
const KEYBOARD_THRESHOLD = 120;

function readViewport(): VisualViewportRect {
  if (typeof window === 'undefined') {
    return { height: 0, offsetTop: 0, keyboardOpen: false };
  }
  const vv = window.visualViewport;
  const height = vv ? vv.height : window.innerHeight;
  const offsetTop = vv ? vv.offsetTop : 0;
  return {
    height,
    offsetTop,
    keyboardOpen: window.innerHeight - height > KEYBOARD_THRESHOLD,
  };
}

/**
 * ソフトキーボードを考慮した「実際に見えている領域」を返す。
 *
 * スマホのブラウザ（既定の interactive-widget=resizes-visual）では、キーボードが
 * 出ても position:fixed / 100dvh の基準になるレイアウトビューポートは縮まないため、
 * ダイアログの下部がキーボードに隠れてしまう。visualViewport を購読して
 * 見えている高さに合わせることで、キーボード表示中でもダイアログ全体を収められる。
 */
export function useVisualViewport(enabled = true): VisualViewportRect {
  const [rect, setRect] = useState<VisualViewportRect>(readViewport);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      // キーボードの開閉アニメーション中は値が細かく変わるので次フレームでまとめて反映
      frame = requestAnimationFrame(() => setRect(readViewport()));
    };
    update();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      cancelAnimationFrame(frame);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [enabled]);

  return rect;
}

export default useVisualViewport;

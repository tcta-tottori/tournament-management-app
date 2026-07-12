// =============================================
// アプリ全体のエラーバウンダリ
// 描画時の例外で画面が真っ白になるのを防ぎ、
// 復帰用のUI（再読み込み）とエラー内容を表示する。
// 入力データは自動保存されているため、再読み込みで復帰できる。
// =============================================

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 診断用にコンソールへ出力（本番でも参照可能）
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleDismiss = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-red-200 overflow-hidden">
          <div className="px-5 py-4 bg-gradient-to-r from-red-500 to-orange-500 text-white">
            <h2 className="text-base font-bold">問題が発生しました</h2>
            <p className="text-[11px] text-white/85 mt-0.5">
              入力内容は自動保存されています。再読み込みで復帰できます。
            </p>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-sm text-slate-600 leading-relaxed">
              画面の表示中にエラーが発生しました。下のボタンで再読み込みするか、
              「閉じて続ける」で操作を続けられます。
            </p>
            {this.state.error && (
              <pre className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto max-h-32 whitespace-pre-wrap break-words">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex gap-2.5">
              <button
                onClick={this.handleDismiss}
                className="flex-1 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 transition-all"
              >
                閉じて続ける
              </button>
              <button
                onClick={this.handleReload}
                className="flex-1 py-2.5 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 shadow-sm transition-all"
              >
                再読み込み
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

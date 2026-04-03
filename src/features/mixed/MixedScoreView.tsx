import { useEffect } from 'react';
import { useMixedStore } from './mixedStore';
import MixedBracketView from './MixedBracketView';

export default function MixedScoreView() {
  const { brackets, leagues, autoPopulateBrackets } = useMixedStore();

  // ブラケットがまだ生成されていなければ自動生成（リーグ未完了でも）
  useEffect(() => {
    if (brackets.length === 0 && leagues.length > 0) {
      autoPopulateBrackets();
    }
  }, [brackets.length, leagues.length, autoPopulateBrackets]);

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <MixedBracketView />
    </div>
  );
}

import { useState, useEffect } from 'react';
import { formatTime } from '../../lib/utils';

export default function LastUpdated() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="text-xs text-gray-400">
      最終更新: {formatTime(now)}
    </span>
  );
}

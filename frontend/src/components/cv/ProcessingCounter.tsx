import { useState, useEffect } from 'react';
import { getProcessingCount } from '../../api/cv';

export default function ProcessingCounter() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const c = await getProcessingCount();
        if (active) setCount(c);
      } catch {
        // ignore
      }
    };

    poll();
    const id = setInterval(poll, 3000);
    return () => { active = false; clearInterval(id); };
  }, []);

  if (count <= 0) return null;

  return (
    <div className="flex items-center gap-2 bg-amber-500/15 border border-amber-500/25 text-amber-300 px-3 py-1.5 rounded-full text-xs font-medium">
      <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      Processing {count} CV{count > 1 ? 's' : ''}...
    </div>
  );
}

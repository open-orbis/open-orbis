import { useCallback, useRef, useMemo } from 'react';
import { useDateFilterStore } from '../../stores/dateFilterStore';

interface DateRangeSliderProps {
  minDate: string; // "YYYY-MM"
  maxDate: string; // "YYYY-MM"
}

/** Convert "YYYY-MM" to total months since epoch for linear interpolation. */
function toMonths(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return y * 12 + (m - 1);
}

/** Convert total months back to "YYYY-MM". */
function fromMonths(total: number): string {
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Format "YYYY-MM" to readable label like "Jun 2020". */
function formatLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export default function DateRangeSlider({ minDate, maxDate }: DateRangeSliderProps) {
  const { rangeStart, rangeEnd, setRange, resetRange } = useDateFilterStore();
  const isFiltered = rangeStart !== null || rangeEnd !== null;
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<'lower' | 'upper' | null>(null);

  const minM = useMemo(() => toMonths(minDate), [minDate]);
  const maxM = useMemo(() => toMonths(maxDate), [maxDate]);
  const totalSpan = maxM - minM;

  // Current handle positions (default to full range, clamped to bounds)
  const lowerM = Math.max(minM, Math.min(maxM, rangeStart ? toMonths(rangeStart) : minM));
  const upperM = Math.max(minM, Math.min(maxM, rangeEnd ? toMonths(rangeEnd) : maxM));

  // Convert month value to % from BOTTOM of track (bottom = minDate, top = maxDate)
  const toPercent = useCallback(
    (m: number) => (totalSpan === 0 ? 0 : ((m - minM) / totalSpan) * 100),
    [minM, totalSpan],
  );

  const lowerPct = toPercent(lowerM);
  const upperPct = toPercent(upperM);

  // Pointer → month value from track position
  const pointerToMonth = useCallback(
    (clientY: number): number => {
      if (!trackRef.current || totalSpan === 0) return minM;
      const rect = trackRef.current.getBoundingClientRect();
      // Inverted: top of track = maxDate, bottom = minDate
      const ratio = 1 - (clientY - rect.top) / rect.height;
      const clamped = Math.max(0, Math.min(1, ratio));
      return Math.round(minM + clamped * totalSpan);
    },
    [minM, totalSpan],
  );

  const onPointerDown = useCallback(
    (handle: 'lower' | 'upper') => (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      draggingRef.current = handle;
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      const m = pointerToMonth(e.clientY);

      if (draggingRef.current === 'lower') {
        const clampedLower = Math.min(m, upperM);
        setRange(fromMonths(clampedLower), fromMonths(upperM));
      } else {
        const clampedUpper = Math.max(m, lowerM);
        setRange(fromMonths(lowerM), fromMonths(clampedUpper));
      }
    },
    [pointerToMonth, lowerM, upperM, setRange],
  );

  const onPointerUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  return (
    <div
      className="absolute left-5 top-16 bottom-24 w-10 hidden sm:flex flex-col items-center z-20 select-none"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Max date label (top) */}
      <span className="text-[9px] text-white/30 mb-1 whitespace-nowrap">
        {formatLabel(maxDate)}
      </span>

      {/* Track container */}
      <div ref={trackRef} className="relative flex-1 w-full flex justify-center">
        {/* Background track */}
        <div className="absolute top-0 bottom-0 w-[3px] rounded-full bg-white/10" />

        {/* Active range (purple) */}
        <div
          className="absolute w-[3px] rounded-full bg-[#785EF0]"
          style={{
            bottom: `${lowerPct}%`,
            top: `${100 - upperPct}%`,
          }}
        />

        {/* Upper handle */}
        <div
          className="absolute cursor-grab active:cursor-grabbing touch-none"
          style={{ left: '50%', bottom: `${upperPct}%`, transform: `translate(-50%, 50%)` }}
          onPointerDown={onPointerDown('upper')}
        >
          <div className="w-[14px] h-[14px] rounded-full bg-[#785EF0] border-2 border-white shadow-lg shadow-purple-500/30" />
          <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[10px] text-white/50 whitespace-nowrap pointer-events-none">
            {formatLabel(fromMonths(upperM))}
          </span>
        </div>

        {/* Lower handle */}
        <div
          className="absolute cursor-grab active:cursor-grabbing touch-none"
          style={{ left: '50%', bottom: `${lowerPct}%`, transform: `translate(-50%, 50%)` }}
          onPointerDown={onPointerDown('lower')}
        >
          <div className="w-[14px] h-[14px] rounded-full bg-[#785EF0] border-2 border-white shadow-lg shadow-purple-500/30" />
          <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[10px] text-white/50 whitespace-nowrap pointer-events-none">
            {formatLabel(fromMonths(lowerM))}
          </span>
        </div>
      </div>

      {/* Min date label (bottom) */}
      <span className="text-[9px] text-white/30 mt-1 whitespace-nowrap">
        {formatLabel(minDate)}
      </span>

      {/* Reset button */}
      {isFiltered && (
        <button
          onClick={resetRange}
          className="mt-2 w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          title="Reset date filter"
        >
          <svg className="w-3 h-3 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 1 9 9" />
            <polyline points="3 3 3 12 12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

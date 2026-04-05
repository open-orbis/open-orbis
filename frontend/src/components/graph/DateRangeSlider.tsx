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
      className="absolute left-3 top-24 bottom-32 hidden sm:flex flex-col items-center z-20 select-none"
      style={{ width: '52px' }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Glass panel background */}
      <div className="absolute inset-0 rounded-2xl bg-white/[0.03] backdrop-blur-sm border border-white/[0.06]" />

      {/* Content */}
      <div className="relative flex flex-col items-center w-full h-full py-3 px-1">
        {/* Max date label (top) */}
        <span className="text-[8px] font-medium text-white/25 tracking-wide uppercase whitespace-nowrap mb-2">
          {formatLabel(maxDate)}
        </span>

        {/* Track container */}
        <div ref={trackRef} className="relative flex-1 w-full flex justify-center">
          {/* Background track */}
          <div className="absolute top-0 bottom-0 w-[2px] rounded-full bg-white/[0.08]" />

          {/* Active range (purple gradient) */}
          <div
            className="absolute w-[2px] rounded-full"
            style={{
              bottom: `${lowerPct}%`,
              top: `${100 - upperPct}%`,
              background: 'linear-gradient(to top, #6347d6, #9b7eff)',
            }}
          />
          {/* Active range glow */}
          <div
            className="absolute w-[6px] rounded-full opacity-30 blur-[2px]"
            style={{
              bottom: `${lowerPct}%`,
              top: `${100 - upperPct}%`,
              background: 'linear-gradient(to top, #6347d6, #9b7eff)',
              left: '50%',
              transform: 'translateX(-50%)',
            }}
          />

          {/* Upper handle */}
          <div
            className="absolute cursor-grab active:cursor-grabbing touch-none"
            style={{ left: '50%', bottom: `${upperPct}%`, transform: 'translate(-50%, 50%)' }}
            onPointerDown={onPointerDown('upper')}
          >
            {/* Larger invisible hit area */}
            <div className="absolute -inset-2" />
            {/* Handle visual */}
            <div className="w-3 h-3 rounded-full bg-white border-[1.5px] border-[#785EF0] shadow-[0_0_8px_rgba(120,94,240,0.5)]
              transition-transform active:scale-125" />
            {/* Date label */}
            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-[10px] font-medium text-white/60 whitespace-nowrap pointer-events-none
              bg-black/40 backdrop-blur-sm rounded px-1.5 py-0.5 border border-white/[0.06]">
              {formatLabel(fromMonths(upperM))}
            </span>
          </div>

          {/* Lower handle */}
          <div
            className="absolute cursor-grab active:cursor-grabbing touch-none"
            style={{ left: '50%', bottom: `${lowerPct}%`, transform: 'translate(-50%, 50%)' }}
            onPointerDown={onPointerDown('lower')}
          >
            {/* Larger invisible hit area */}
            <div className="absolute -inset-2" />
            {/* Handle visual */}
            <div className="w-3 h-3 rounded-full bg-white border-[1.5px] border-[#785EF0] shadow-[0_0_8px_rgba(120,94,240,0.5)]
              transition-transform active:scale-125" />
            {/* Date label */}
            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-[10px] font-medium text-white/60 whitespace-nowrap pointer-events-none
              bg-black/40 backdrop-blur-sm rounded px-1.5 py-0.5 border border-white/[0.06]">
              {formatLabel(fromMonths(lowerM))}
            </span>
          </div>
        </div>

        {/* Min date label (bottom) */}
        <span className="text-[8px] font-medium text-white/25 tracking-wide uppercase whitespace-nowrap mt-2">
          {formatLabel(minDate)}
        </span>

        {/* Reset button */}
        <button
          onClick={resetRange}
          disabled={!isFiltered}
          className="mt-2 w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] disabled:hover:bg-white/[0.06] border border-white/[0.08] hover:border-white/[0.15] disabled:hover:border-white/[0.08]
            flex items-center justify-center transition-all group disabled:opacity-30 disabled:cursor-default"
          title="Reset date filter"
        >
          <svg className="w-3 h-3 text-white/40 group-hover:text-white/70 group-disabled:text-white/40 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 1 9 9" />
            <polyline points="3 3 3 12 12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

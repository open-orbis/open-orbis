import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';

interface QrShareModalProps {
  open: boolean;
  url: string;
  onClose: () => void;
}

// Orbis brand — violet family (derived from public/favicon.svg + manifest theme_color).
// Foreground is #7c3aed on white ≈ 8:1 contrast (AAA), safe for reliable scanning.
const QR_FG = '#7c3aed';
const QR_BG = '#ffffff';

function serializeQr(svgWrap: HTMLDivElement): { blob: Blob; width: number; height: number } | null {
  const svgEl = svgWrap.querySelector('svg');
  if (!svgEl) return null;
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const rect = svgEl.getBoundingClientRect();
  const serialized = new XMLSerializer().serializeToString(clone);
  return {
    blob: new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

function triggerDownload(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(href);
}

export default function QrShareModal({ open, url, onClose }: QrShareModalProps) {
  const svgWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const handleDownloadSvg = () => {
    if (!svgWrapRef.current) return;
    const data = serializeQr(svgWrapRef.current);
    if (!data) return;
    triggerDownload(data.blob, 'orbis-qr.svg');
  };

  const handleDownloadPng = () => {
    if (!svgWrapRef.current) return;
    const data = serializeQr(svgWrapRef.current);
    if (!data) return;
    const svgUrl = URL.createObjectURL(data.blob);
    const img = new Image();
    img.onload = () => {
      const scale = 4; // crisp for print
      const canvas = document.createElement('canvas');
      canvas.width = data.width * scale;
      canvas.height = data.height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(svgUrl);
        return;
      }
      ctx.fillStyle = QR_BG;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((pngBlob) => {
        URL.revokeObjectURL(svgUrl);
        if (!pngBlob) return;
        triggerDownload(pngBlob, 'orbis-qr.png');
      }, 'image/png');
    };
    img.onerror = () => URL.revokeObjectURL(svgUrl);
    img.src = svgUrl;
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Share via QR code"
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="relative w-[92vw] max-w-sm mx-2 sm:mx-4 rounded-3xl p-1 shadow-[0_0_80px_rgba(124,58,237,0.35)]"
            style={{
              background:
                'linear-gradient(140deg, rgba(196,181,253,0.65) 0%, rgba(124,58,237,0.55) 50%, rgba(59,7,100,0.55) 100%)',
            }}
          >
            <div className="relative rounded-[22px] bg-white px-6 pt-6 pb-5 flex flex-col items-center">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-violet-900/40 hover:text-violet-900 hover:bg-violet-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <p className="text-[10px] tracking-[0.25em] uppercase text-violet-600/70 font-semibold mb-4">
                Orbis QR
              </p>

              <div
                ref={svgWrapRef}
                className="rounded-2xl bg-white p-3 ring-1 ring-violet-200/80 shadow-inner"
              >
                <QRCodeSVG
                  value={url || ' '}
                  size={224}
                  bgColor={QR_BG}
                  fgColor={QR_FG}
                  level="M"
                  marginSize={2}
                />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 w-full">
                <button
                  type="button"
                  onClick={handleDownloadSvg}
                  className="h-9 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  SVG
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPng}
                  className="h-9 rounded-lg bg-violet-100 hover:bg-violet-200 text-violet-800 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  PNG
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

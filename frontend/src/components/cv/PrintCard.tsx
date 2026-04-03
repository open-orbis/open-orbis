import { QRCodeSVG } from 'qrcode.react';

interface PrintCardProps {
  name: string;
  headline: string;
  shareUrl: string;
}

export default function PrintCard({ name, headline, shareUrl }: PrintCardProps) {
  return (
    <div 
      id="print-card-template" 
      className="bg-white text-black p-6 w-[400px] h-[240px] flex flex-col justify-between border border-gray-100 shadow-sm relative overflow-hidden"
      style={{ fontFamily: 'sans-serif' }}
    >
      {/* Decorative background element */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-purple-50 rounded-full opacity-50" />
      <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-purple-50 rounded-full opacity-50" />

      <div className="relative z-10 flex justify-between items-start">
        <div className="max-w-[260px]">
          <h1 className="text-2xl font-bold text-gray-900 leading-tight mb-1">{name}</h1>
          <p className="text-purple-600 text-sm font-medium uppercase tracking-wider mb-2">{headline}</p>
        </div>
        <div className="flex items-center gap-1.5 opacity-80">
           <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center">
             <div className="w-2.5 h-2.5 rounded-full bg-white" />
           </div>
           <span className="font-bold text-base tracking-tight text-gray-900">OpenOrbis</span>
        </div>
      </div>
      
      <div className="relative z-10 flex justify-between items-end">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] text-gray-400 font-medium">
            YOUR PROFESSIONAL GRAPH
          </p>
          <p className="text-xs text-gray-500 font-mono">
            {shareUrl.replace(/^https?:\/\//, '')}
          </p>
        </div>
        <div className="bg-white p-2 rounded-xl shadow-[0_0_15px_rgba(0,0,0,0.05)] border border-gray-100">
           <QRCodeSVG value={shareUrl} size={80} level="H" includeMargin={false} />
        </div>
      </div>
    </div>
  );
}

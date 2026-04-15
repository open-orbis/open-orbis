import { useEffect, useState } from 'react';

interface PdfPreviewProps {
  pdfBlob: Blob | null;
  isLoading: boolean;
}

export default function PdfPreview({ pdfBlob, isLoading }: PdfPreviewProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!pdfBlob) {
      setPdfUrl(null);
      return;
    }
    // Ensure blob has correct type
    const typedBlob = pdfBlob.type === 'application/pdf'
      ? pdfBlob
      : new Blob([pdfBlob], { type: 'application/pdf' });
    const url = URL.createObjectURL(typedBlob);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pdfBlob]);

  return (
    <div className="flex flex-col h-full bg-neutral-700">
      <div className="flex items-center px-3 py-1.5 bg-neutral-800 border-b border-neutral-600 text-xs text-neutral-300">
        <span className="uppercase tracking-wider text-neutral-400">PDF Preview</span>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-full text-neutral-400">
            Compiling...
          </div>
        )}
        {!isLoading && !pdfUrl && (
          <div className="flex items-center justify-center h-full text-neutral-400">
            Click "Refresh Preview" to compile
          </div>
        )}
        {!isLoading && pdfUrl && (
          <iframe
            src={pdfUrl}
            className="w-full h-full border-0"
            title="PDF Preview"
          />
        )}
      </div>
    </div>
  );
}

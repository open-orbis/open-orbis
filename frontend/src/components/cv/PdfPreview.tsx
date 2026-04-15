// frontend/src/components/cv/PdfPreview.tsx
import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PdfPreviewProps {
  pdfBlob: Blob | null;
  isLoading: boolean;
}

export default function PdfPreview({ pdfBlob, isLoading }: PdfPreviewProps) {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.0);

  const pdfUrl = pdfBlob ? URL.createObjectURL(pdfBlob) : null;

  return (
    <div className="flex flex-col h-full bg-neutral-700">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-800 border-b border-neutral-600 text-xs text-neutral-300">
        <span className="uppercase tracking-wider text-neutral-400">PDF Preview</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
            className="px-1.5 py-0.5 bg-neutral-700 border border-neutral-500 rounded text-neutral-300 hover:bg-neutral-600"
          >
            -
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => Math.min(2.0, z + 0.1))}
            className="px-1.5 py-0.5 bg-neutral-700 border border-neutral-500 rounded text-neutral-300 hover:bg-neutral-600"
          >
            +
          </button>
          {numPages > 1 && (
            <>
              <span className="mx-1 text-neutral-500">|</span>
              <span>
                Page {currentPage} / {numPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="px-1.5 py-0.5 bg-neutral-700 border border-neutral-500 rounded text-neutral-300 hover:bg-neutral-600 disabled:opacity-40"
              >
                &larr;
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
                disabled={currentPage >= numPages}
                className="px-1.5 py-0.5 bg-neutral-700 border border-neutral-500 rounded text-neutral-300 hover:bg-neutral-600 disabled:opacity-40"
              >
                &rarr;
              </button>
            </>
          )}
        </div>
      </div>

      {/* PDF Content */}
      <div className="flex-1 overflow-auto flex justify-center p-5">
        {isLoading && (
          <div className="flex items-center justify-center text-neutral-400">
            Compiling...
          </div>
        )}
        {!isLoading && !pdfUrl && (
          <div className="flex items-center justify-center text-neutral-400">
            Click "Refresh Preview" to compile
          </div>
        )}
        {!isLoading && pdfUrl && (
          <Document
            file={pdfUrl}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            className="shadow-xl"
          >
            <Page pageNumber={currentPage} scale={zoom} />
          </Document>
        )}
      </div>
    </div>
  );
}

// frontend/src/components/cv/TemplateEditor.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { StreamLanguage } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { oneDark } from '@codemirror/theme-one-dark';
import { compileTemplate, type TemplateDetail } from '../../api/templates';
import PdfPreview from './PdfPreview';

interface TemplateEditorProps {
  template: TemplateDetail;
  onBack: () => void;
}

export default function TemplateEditor({ template, onBack }: TemplateEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize CodeMirror
  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: template.tex_content,
      extensions: [
        basicSetup,
        StreamLanguage.define(stex),
        oneDark,
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [template.id]); // Re-create editor when template changes

  const getTexContent = useCallback(() => {
    return viewRef.current?.state.doc.toString() || template.tex_content;
  }, [template.tex_content]);

  const handleRefresh = useCallback(async () => {
    setIsCompiling(true);
    setError(null);
    try {
      const blob = await compileTemplate(template.id, getTexContent());
      console.log('Compile response:', blob, 'type:', blob?.type, 'size:', blob?.size);
      if (blob instanceof Blob) {
        const first4 = await blob.slice(0, 4).text();
        console.log('First 4 bytes:', first4);
      }
      setPdfBlob(blob);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Compilation failed';
      setError(message);
    } finally {
      setIsCompiling(false);
    }
  }, [template.id, getTexContent]);

  const handleExport = useCallback(async () => {
    setIsCompiling(true);
    setError(null);
    try {
      const blob = await compileTemplate(template.id, getTexContent());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cv.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Export failed';
      setError(message);
    } finally {
      setIsCompiling(false);
    }
  }, [template.id, getTexContent]);

  return (
    <div className="flex flex-col h-screen bg-neutral-900">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-neutral-800 border-b border-neutral-700">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="px-3 py-1 text-xs border border-neutral-500 text-neutral-300 rounded hover:bg-neutral-700"
          >
            &larr; Back to Templates
          </button>
          <span className="text-sm text-neutral-400">Template:</span>
          <span className="text-sm font-semibold text-neutral-100">{template.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <span className="text-xs text-red-400 max-w-md truncate">{error}</span>
          )}
          <button
            onClick={handleRefresh}
            disabled={isCompiling}
            className="px-4 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {isCompiling ? 'Compiling...' : 'Refresh Preview'}
          </button>
          <button
            onClick={handleExport}
            disabled={isCompiling}
            className="px-4 py-1.5 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 disabled:opacity-50"
          >
            Export PDF
          </button>
        </div>
      </div>

      {/* Split Pane */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Code Editor */}
        <div className="flex-1 flex flex-col border-r-2 border-neutral-700 min-w-0">
          <div className="px-3 py-1.5 bg-neutral-800 border-b border-neutral-700 flex justify-between text-xs text-neutral-400">
            <span className="uppercase tracking-wider">LaTeX Source</span>
            <span>template.tex</span>
          </div>
          <div ref={editorRef} className="flex-1 overflow-auto" />
        </div>

        {/* Right: PDF Preview */}
        <div className="flex-1 min-w-0">
          <PdfPreview pdfBlob={pdfBlob} isLoading={isCompiling} />
        </div>
      </div>
    </div>
  );
}

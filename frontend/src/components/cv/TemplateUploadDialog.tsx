// frontend/src/components/cv/TemplateUploadDialog.tsx
import { useState, type FormEvent } from 'react';
import { uploadTemplate } from '../../api/templates';

interface TemplateUploadDialogProps {
  onClose: () => void;
  onUploaded: (templateId: string) => void;
}

export default function TemplateUploadDialog({ onClose, onUploaded }: TemplateUploadDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [engine, setEngine] = useState('xelatex');
  const [texFile, setTexFile] = useState<File | null>(null);
  const [clsFile, setClsFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!texFile || !name) return;

    setSubmitting(true);
    setError(null);
    try {
      const tpl = await uploadTemplate(texFile, name, engine, description, clsFile || undefined);
      onUploaded(tpl.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="bg-neutral-800 rounded-lg p-6 w-full max-w-md shadow-2xl border border-neutral-700"
      >
        <h3 className="text-lg font-semibold text-neutral-100 mb-4">Upload Custom Template</h3>

        <label className="block text-sm text-neutral-300 mb-1">Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full px-3 py-2 mb-3 bg-neutral-700 border border-neutral-600 rounded text-neutral-100 text-sm"
        />

        <label className="block text-sm text-neutral-300 mb-1">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 mb-3 bg-neutral-700 border border-neutral-600 rounded text-neutral-100 text-sm"
        />

        <label className="block text-sm text-neutral-300 mb-1">LaTeX Engine</label>
        <select
          value={engine}
          onChange={(e) => setEngine(e.target.value)}
          className="w-full px-3 py-2 mb-3 bg-neutral-700 border border-neutral-600 rounded text-neutral-100 text-sm"
        >
          <option value="xelatex">XeLaTeX</option>
          <option value="pdflatex">pdfLaTeX</option>
          <option value="lualatex">LuaLaTeX</option>
        </select>

        <label className="block text-sm text-neutral-300 mb-1">.tex File *</label>
        <input
          type="file"
          accept=".tex"
          onChange={(e) => setTexFile(e.target.files?.[0] || null)}
          required
          className="w-full mb-3 text-sm text-neutral-300"
        />

        <label className="block text-sm text-neutral-300 mb-1">.cls File (optional)</label>
        <input
          type="file"
          accept=".cls,.sty"
          onChange={(e) => setClsFile(e.target.files?.[0] || null)}
          className="w-full mb-4 text-sm text-neutral-300"
        />

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-neutral-300 border border-neutral-600 rounded hover:bg-neutral-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !texFile || !name}
            className="px-4 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
          >
            {submitting ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </form>
    </div>
  );
}

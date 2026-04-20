// frontend/src/components/cv/TemplatePicker.tsx
import { useEffect, useState } from 'react';
import { listTemplates, type TemplateListItem } from '../../api/templates';

interface TemplatePickerProps {
  onSelect: (templateId: string) => void;
  onUpload: () => void;
}

export default function TemplatePicker({ onSelect, onUpload }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listTemplates()
      .then(setTemplates)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-neutral-400">
        Loading templates...
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-neutral-100">Choose a Template</h2>
        <button
          onClick={onUpload}
          className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700 transition-colors"
        >
          + Upload Custom Template
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {templates.map((tpl) => (
          <button
            key={tpl.id}
            onClick={() => onSelect(tpl.id)}
            className="bg-neutral-800 rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-shadow text-left cursor-pointer border border-neutral-700 hover:border-purple-500"
          >
            <div className="h-48 bg-neutral-700 flex items-center justify-center">
              {tpl.thumbnail_url ? (
                <img
                  src={tpl.thumbnail_url}
                  alt={tpl.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-neutral-500 text-sm">No preview</span>
              )}
            </div>
            <div className="p-3">
              <div className="font-semibold text-neutral-100">{tpl.name}</div>
              <div className="text-xs text-neutral-400 mt-1">
                {tpl.description || tpl.engine}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// frontend/src/pages/CvExportPage.tsx
import { useState, useCallback } from 'react';
import { getTemplate, type TemplateDetail } from '../api/templates';
import TemplatePicker from '../components/cv/TemplatePicker';
import TemplateEditor from '../components/cv/TemplateEditor';
import TemplateUploadDialog from '../components/cv/TemplateUploadDialog';

export default function CvExportPage() {
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const handleSelect = useCallback(async (templateId: string) => {
    const detail = await getTemplate(templateId);
    setTemplate(detail);
  }, []);

  const handleBack = useCallback(() => {
    setTemplate(null);
  }, []);

  const handleUploaded = useCallback(async (templateId: string) => {
    setShowUpload(false);
    const detail = await getTemplate(templateId);
    setTemplate(detail);
  }, []);

  if (template) {
    return <TemplateEditor key={template.id} template={template} onBack={handleBack} />;
  }

  return (
    <div className="min-h-screen bg-neutral-900">
      <TemplatePicker
        onSelect={handleSelect}
        onUpload={() => setShowUpload(true)}
      />
      {showUpload && (
        <TemplateUploadDialog
          onClose={() => setShowUpload(false)}
          onUploaded={handleUploaded}
        />
      )}
    </div>
  );
}

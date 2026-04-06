import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useOrbStore } from '../stores/orbStore';
import { useAuthStore } from '../stores/authStore';
import OrbGraph3D from '../components/graph/OrbGraph3D';
import FloatingInput from '../components/editor/FloatingInput';
import { NODE_TYPE_LABELS } from '../components/graph/NodeColors';
import CVUploadOnboarding from '../components/onboarding/CVUploadOnboarding';
import ConsentGate from '../components/onboarding/ConsentGate';

const SUGGESTED_ORDER = [
  { type: 'work_experience', prompt: "Let's start with your work experience" },
  { type: 'education', prompt: 'Now add your education' },
  { type: 'skill', prompt: 'What are your key skills?' },
  { type: 'language', prompt: 'Which languages do you speak?' },
  { type: 'certification', prompt: 'Any certifications?' },
  { type: 'project', prompt: 'Notable projects?' },
  { type: 'publication', prompt: 'Any publications?' },
];

// ── Path selector card ──

function PathCard({ title, description, icon, onClick, color }: {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  color: string;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 sm:p-6 text-left hover:border-white/15 hover:bg-white/[0.06] transition-all group w-full"
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
        style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}
      >
        {icon}
      </div>
      <h3 className="text-white text-base font-semibold mb-1.5">{title}</h3>
      <p className="text-white/35 text-sm leading-relaxed">{description}</p>
    </motion.button>
  );
}

export default function CreateOrbPage() {
  const navigate = useNavigate();
  const { data, loading, fetchOrb, addNode } = useOrbStore();
  const { user } = useAuthStore();
  const [selectedPath, setSelectedPath] = useState<'upload' | 'manual' | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    fetchOrb();
  }, [fetchOrb]);

  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // After selecting manual, auto-open the first prompt
  useEffect(() => {
    if (selectedPath === 'manual' && !showInput && currentStep < SUGGESTED_ORDER.length) {
      const timer = setTimeout(() => setShowInput(true), 600);
      return () => clearTimeout(timer);
    }
  }, [selectedPath, showInput, currentStep]);

  const handleSubmit = useCallback(async (nodeType: string, properties: Record<string, unknown>) => {
    await addNode(nodeType, properties);
    setShowInput(false);
  }, [addNode]);

  const handleSkip = useCallback(() => {
    setShowInput(false);
    setCurrentStep((s) => s + 1);
  }, []);

  const handleAddAnother = useCallback(() => {
    setShowInput(true);
  }, []);

  const handleNext = useCallback(() => {
    setCurrentStep((s) => s + 1);
    setShowInput(false);
  }, []);

  const handleFinish = useCallback(() => {
    navigate('/myorbis');
  }, [navigate]);

  const currentSuggestion = currentStep < SUGGESTED_ORDER.length ? SUGGESTED_ORDER[currentStep] : null;
  const nodeCount = data?.nodes.length ?? 0;

  // ── Path selector (no path chosen yet) ──
  if (!selectedPath) {
    return (
      <ConsentGate>
        <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
            How do you want to build your orbis?
          </h1>
          <p className="text-white/35 text-base max-w-md mx-auto">
            Choose how you'd like to add your professional information. You can always add more later.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl"
        >
          <PathCard
            title="Import from your CV"
            description="Upload a PDF or DOCX file. We'll parse it and extract your experiences, skills, and education."
            color="#3b82f6"
            onClick={() => setSelectedPath('upload')}
            icon={
              <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            }
          />
          <PathCard
            title="Build from scratch"
            description="Start with an empty orbis and add entries one by one. Full control over every detail."
            color="#10b981"
            onClick={() => navigate('/myorbis')}
            icon={
              <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            }
          />
        </motion.div>
        </div>
      </ConsentGate>
    );
  }

  // ── CV Upload path ──
  if (selectedPath === 'upload') {
    return <CVUploadOnboarding />;
  }

  // ── Manual path (existing flow) ──

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black relative">
      {/* 3D Graph in background */}
      {data && (
        <OrbGraph3D
          data={data}
          width={dimensions.width}
          height={dimensions.height}
        />
      )}

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4">
        <div className="text-white">
          <span className="text-base sm:text-lg font-semibold">{user?.name || 'My Orbis'}</span>
          <span className="text-gray-500 text-xs sm:text-sm ml-2 sm:ml-3">{nodeCount} nodes</span>
        </div>
        <div className="flex gap-3">
          {nodeCount > 0 && (
            <button
              onClick={handleFinish}
              className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Done — View My Orbisis
            </button>
          )}
        </div>
      </div>

      {/* Bottom prompt bar — shown when input is closed */}
      <AnimatePresence>
        {!showInput && currentSuggestion && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="absolute bottom-8 left-0 right-0 z-30 flex flex-col items-center gap-3"
          >
            <p className="text-white text-base sm:text-lg font-medium text-center px-4">{currentSuggestion.prompt}</p>
            <div className="flex gap-3">
              <button
                onClick={handleAddAnother}
                className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-2.5 px-6 rounded-lg transition-colors shadow-lg shadow-purple-600/25"
              >
                + Add {NODE_TYPE_LABELS[currentSuggestion.type]}
              </button>
              <button
                onClick={handleNext}
                className="border border-gray-600 hover:border-gray-400 text-gray-400 hover:text-gray-200 font-medium py-2.5 px-6 rounded-lg transition-colors"
              >
                Skip
              </button>
            </div>
            {/* Step dots */}
            <div className="flex gap-1.5 mt-2">
              {SUGGESTED_ORDER.map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === currentStep ? 'bg-purple-500' : i < currentStep ? 'bg-purple-800' : 'bg-gray-700'
                  }`}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* All steps done */}
        {!showInput && !currentSuggestion && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="absolute bottom-8 left-0 right-0 z-30 flex flex-col items-center gap-4"
          >
            <p className="text-white text-xl font-semibold">Your orbis is ready!</p>
            <p className="text-gray-400 text-sm">{nodeCount} entries added to your knowledge graph</p>
            <div className="flex gap-3">
              <button
                onClick={handleFinish}
                className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors shadow-lg shadow-purple-600/25"
              >
                View My Orbis
              </button>
              <button
                onClick={() => { setCurrentStep(0); }}
                className="border border-gray-600 hover:border-gray-400 text-gray-400 font-medium py-3 px-6 rounded-lg transition-colors"
              >
                Add More
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Input */}
      <FloatingInput
        open={showInput}
        editNode={currentSuggestion ? { type: currentSuggestion.type, values: {} } : null}
        onSubmit={handleSubmit}
        onCancel={handleSkip}
      />
    </div>
  );
}

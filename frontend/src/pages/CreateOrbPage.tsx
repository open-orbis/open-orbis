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
import Navbar from '../components/Navbar';

const SUGGESTED_ORDER = [
  { type: 'work_experience', prompt: "Let's start with your work experience" },
  { type: 'education', prompt: 'Now add your education' },
  { type: 'skill', prompt: 'What are your key skills?' },
  { type: 'language', prompt: 'Which languages do you speak?' },
  { type: 'certification', prompt: 'Any certifications?' },
  { type: 'project', prompt: 'Notable projects?' },
  { type: 'publication', prompt: 'Any publications?' },
];

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
        <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 relative">
        <Navbar />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8 w-full max-w-2xl"
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
            How do you want to build your{' '}
            <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">orbis</span>?
          </h1>
          <p className="text-white/35 text-base max-w-md mx-auto">
            Choose your starting path.
            <br />
            You can always add or edit entries later.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5"
        >
          <div className="space-y-3 mb-4">
            <h2 className="text-white font-semibold text-base">What will happen next</h2>
            <ul className="space-y-1.5 text-sm text-white/45">
              <li>1. Upload your CV and review extracted entries.</li>
              <li>2. Edit or remove anything before adding to your orbis.</li>
              <li>3. Finalize it to see your orbis and keep enriching it.</li>
            </ul>
          </div>

          <button
            onClick={() => setSelectedPath('upload')}
            className="w-full rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 px-4 transition-colors"
          >
            Build from your CV
          </button>
          <button
            onClick={() => navigate('/myorbis', { state: { allowEmpty: true, startTour: true } })}
            className="w-full mt-2 rounded-xl border border-white/15 hover:border-white/30 text-white/70 hover:text-white py-3 px-4 transition-colors"
          >
            Build from scratch
          </button>
        </motion.div>
        </div>
      </ConsentGate>
    );
  }

  // ── CV Upload path ──
  if (selectedPath === 'upload') {
    return (
      <div className="relative">
        <Navbar />
        <CVUploadOnboarding />
      </div>
    );
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
      <Navbar
        center={
          <div className="text-white/70 text-sm">
            <span className="font-medium text-white">{user?.name || 'My Orbis'}</span>
            <span className="text-white/30 ml-2 hidden sm:inline">{nodeCount} nodes</span>
          </div>
        }
        rightBefore={
          nodeCount > 0 ? (
            <button
              onClick={handleFinish}
              className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium py-1.5 px-3 sm:px-4 rounded-lg transition-colors cursor-pointer"
            >
              Done <span className="hidden sm:inline">— View My Orbis</span>
            </button>
          ) : null
        }
      />

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

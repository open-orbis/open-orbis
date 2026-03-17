import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useOrbStore } from '../stores/orbStore';
import { useAuthStore } from '../stores/authStore';
import OrbGraph3D from '../components/graph/OrbGraph3D';
import FloatingInput from '../components/editor/FloatingInput';
import { NODE_TYPE_LABELS } from '../components/graph/NodeColors';

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
  const [showInput, setShowInput] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [introDone, setIntroDone] = useState(false);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    fetchOrb();
  }, [fetchOrb]);

  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // After intro animation, auto-open the first prompt
  useEffect(() => {
    if (introDone && !showInput && currentStep < SUGGESTED_ORDER.length) {
      const timer = setTimeout(() => setShowInput(true), 600);
      return () => clearTimeout(timer);
    }
  }, [introDone, showInput, currentStep]);

  const handleSubmit = useCallback(async (nodeType: string, properties: Record<string, unknown>) => {
    await addNode(nodeType, properties);
    setShowInput(false);
    // Brief pause to let user see the node appear, then prompt next
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
    navigate('/orb');
  }, [navigate]);

  const currentSuggestion = currentStep < SUGGESTED_ORDER.length ? SUGGESTED_ORDER[currentStep] : null;
  const nodeCount = data?.nodes.length ?? 0;

  // Intro: dark-to-black transition with text
  if (!introDone) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          initial={{ backgroundColor: '#000' }}
          animate={{ backgroundColor: '#000' }}
          className="min-h-screen flex flex-col items-center justify-center"
        >
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="text-gray-400 text-lg mb-8 text-center max-w-md"
          >
            Build your orb entry by entry.
            <br />
            <span className="text-gray-500 text-sm">Each entry becomes a node in your knowledge graph.</span>
          </motion.p>
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.6 }}
            onClick={() => setIntroDone(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors shadow-lg shadow-purple-600/25"
          >
            Let's go
          </motion.button>
        </motion.div>
      </AnimatePresence>
    );
  }

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
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-6 py-4">
        <div className="text-white">
          <span className="text-lg font-semibold">{user?.name || 'My Orb'}</span>
          <span className="text-gray-500 text-sm ml-3">{nodeCount} nodes</span>
        </div>
        <div className="flex gap-3">
          {nodeCount > 0 && (
            <button
              onClick={handleFinish}
              className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Done — View My Orb
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
            <p className="text-white text-lg font-medium">{currentSuggestion.prompt}</p>
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
            <p className="text-white text-xl font-semibold">Your orb is ready!</p>
            <p className="text-gray-400 text-sm">{nodeCount} entries added to your knowledge graph</p>
            <div className="flex gap-3">
              <button
                onClick={handleFinish}
                className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors shadow-lg shadow-purple-600/25"
              >
                View My Orb
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

import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const FEATURES = [
  {
    title: 'One graph, zero templates',
    description: 'Stop choosing templates and reformatting for every application. Build your knowledge graph once — export it as a PDF, embed it in your website, or just share the link. It adapts to every context.',
  },
  {
    title: 'Portable & machine-readable',
    description: 'Your orbis has a unique URL and QR code. Pass it to any LLM, embed it in your portfolio, or add it to your email signature. Humans see a 3D graph — AI agents get structured data via MCP.',
  },
  {
    title: 'Always up to date',
    description: 'Update your orbis in one place. Every generated CV, shared link, and agent query reflects the latest version instantly. No more outdated PDFs floating around.',
  },
  {
    title: 'You control access',
    description: 'Your data is encrypted end-to-end. Decide what each recruiter or AI agent can see with keyword-based filters. Your professional identity, your rules.',
  },
];

export default function AboutPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => navigate(-1)}
          className="text-gray-500 hover:text-gray-300 text-sm mb-12 block transition-colors cursor-pointer"
        >
          &larr; Back
        </motion.button>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-5xl font-bold mb-4"
        >
          Beyond the CV.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="text-gray-400 text-lg mb-16"
        >
          An orbis is your career as a knowledge graph — queryable, shareable, portable.
          It replaces static CVs and disconnected profiles with a living, interactive
          representation that both humans and AI agents can understand.
        </motion.p>

        <div className="space-y-10">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 + i * 0.1, duration: 0.6 }}
            >
              <h2 className="text-xl font-semibold text-white mb-2">{feature.title}</h2>
              <p className="text-gray-400">{feature.description}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="mt-16"
        >
          <button
            onClick={() => navigate('/')}
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors shadow-lg shadow-purple-600/25 cursor-pointer"
          >
            Create Your Orbis
          </button>
        </motion.div>
      </div>
    </div>
  );
}

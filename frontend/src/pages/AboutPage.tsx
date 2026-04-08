import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const FEATURES = [
  {
    title: 'One graph, zero templates',
    description: 'Stop wasting time choosing CV templates and rewriting your resume. Create your knowledge graph once — it works everywhere.',
  },
  {
    title: 'Portable & machine-readable',
    description: 'Your orbis has a unique link (e.g. orbis.io/alessandro-berti). Pass it to any LLM, agent, or tool and it gets perfectly structured data.',
  },
  {
    title: 'Always up to date',
    description: 'Update your orbis in one place. Generated CVs, websites, and profiles update downstream. Single source of truth.',
  },
  {
    title: 'You control access',
    description: 'Granular permissions let you decide what each agent or recruiter can see. Your data, encrypted by default.',
  },
  {
    title: 'Connected network',
    description: 'When collaborators join OpenOrbis, your orbis link together — forming a professional knowledge graph that recruiters can explore.',
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
          What is an Orbis?
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="text-gray-400 text-lg mb-16"
        >
          An orbis is a portable, structured knowledge graph of your professional identity.
          It replaces your CV, your landing page, and your LinkedIn profile — with something
          that both humans and machines can understand.
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
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors shadow-lg shadow-purple-600/25"
          >
            Create Your Orbis
          </button>
        </motion.div>
      </div>
    </div>
  );
}

import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

const footerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      delay: i * 0.1,
    },
  }),
};

const FOOTER_LINKS = {
  links: [
    { label: 'About', to: '/about', isInternal: true },
    { label: 'Privacy Policy', to: '/privacy', isInternal: true },
  ],
  contact: [
    { label: 'Email', href: 'mailto:hello@open-orbis.com' },
    { label: 'GitHub', href: 'https://github.com/Brotherhood94/orb_project', external: true },
  ],
};

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-white/[0.05] bg-black py-12 px-6">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
        <motion.div 
          variants={footerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          custom={0}
          className="flex flex-col gap-4"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-purple-400" />
            </div>
            <span className="text-white font-bold text-lg tracking-tight">OpenOrbis</span>
          </div>
          <p className="text-white/40 text-sm max-w-xs">Your career as a knowledge graph. Reimagined for the AI era.</p>
        </motion.div>

        <motion.div 
          variants={footerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          custom={1}
          className="grid grid-cols-2 gap-8 md:col-span-1"
        >
          <div className="flex flex-col gap-3">
            <h4 className="text-white text-sm font-semibold mb-1">Links</h4>
            {FOOTER_LINKS.links.map((link) => (
              <Link 
                key={link.label} 
                to={link.to} 
                className="text-white/40 hover:text-white/80 transition-colors text-sm"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <h4 className="text-white text-sm font-semibold mb-1">Contact</h4>
            {FOOTER_LINKS.contact.map((link) => (
              <a 
                key={link.label}
                href={link.href}
                target={link.external ? "_blank" : undefined}
                rel={link.external ? "noopener noreferrer" : undefined}
                className="text-white/40 hover:text-white/80 transition-colors text-sm"
              >
                {link.label}
              </a>
            ))}
          </div>
        </motion.div>

        <motion.div 
          variants={footerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          custom={2}
          className="flex flex-col md:items-end justify-between gap-4"
        >
          <p className="text-white/15 text-xs">© {currentYear} Open Orbis. All rights reserved.</p>
        </motion.div>
      </div>
    </footer>
  );
}

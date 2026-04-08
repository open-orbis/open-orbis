import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { FOOTER_CONTENT } from '../../data/footer';

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

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const { brand, sections } = FOOTER_CONTENT;

  return (
    <footer className="border-t border-white/[0.05] bg-black py-12 px-6">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
        {/* Brand Section */}
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
            <span className="text-white font-bold text-lg tracking-tight">{brand.name}</span>
          </div>
          <p className="text-white/40 text-sm max-w-xs whitespace-pre-line">{brand.tagline}</p>
        </motion.div>

        {/* Links Sections */}
        <motion.div 
          variants={footerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          custom={1}
          className="grid grid-cols-2 gap-8 md:col-span-1"
        >
          {sections.map((section) => (
            <div key={section.title} className="flex flex-col gap-3">
              <h4 className="text-white text-sm font-semibold mb-1">{section.title}</h4>
              {section.links.map((link) => (
                link.isInternal ? (
                  <Link 
                    key={link.label} 
                    to={link.to || '#'} 
                    className="text-white/40 hover:text-white/80 transition-colors text-sm"
                  >
                    {link.label}
                  </Link>
                ) : (
                  <a 
                    key={link.label}
                    href={link.href}
                    target={link.isExternal ? "_blank" : undefined}
                    rel={link.isExternal ? "noopener noreferrer" : undefined}
                    className="text-white/40 hover:text-white/80 transition-colors text-sm"
                  >
                    {link.label}
                  </a>
                )
              ))}
            </div>
          ))}
        </motion.div>

        {/* Copyright Section */}
        <motion.div 
          variants={footerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          custom={2}
          className="flex flex-col md:items-end justify-between gap-4"
        >
          <p className="text-white/15 text-xs">
            © {currentYear} {brand.copyrightOwner}. All rights reserved.
          </p>
        </motion.div>
      </div>
    </footer>
  );
}

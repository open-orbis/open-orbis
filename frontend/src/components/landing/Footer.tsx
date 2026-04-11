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
  const { brand, links } = FOOTER_CONTENT;

  return (
    <footer className="border-t border-white/[0.05] bg-black py-10 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        {/* Brand */}
        <motion.div
          variants={footerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          custom={0}
          className="flex flex-col gap-2"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-purple-400" />
            </div>
            <span className="text-white font-bold text-lg tracking-tight">{brand.name}</span>
          </div>
          <p className="text-white/40 text-sm max-w-xs whitespace-pre-line">{brand.tagline}</p>
        </motion.div>

        {/* Links + Copyright */}
        <motion.div
          variants={footerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          custom={1}
          className="flex flex-col items-start md:items-end gap-4"
        >
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {links.map((link) =>
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
            )}
          </div>
          <p className="text-white/15 text-xs">
            © {currentYear} {brand.copyrightOwner}. All rights reserved.
          </p>
        </motion.div>
      </div>
    </footer>
  );
}

import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export default function PrivacyPolicyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <button
          onClick={() => navigate(-1)}
          className="text-white/30 hover:text-white/60 text-sm mb-8 flex items-center gap-1 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-white/30 text-sm mb-10">Last updated: April 2026</p>

          <div className="space-y-8 text-white/60 text-sm leading-relaxed">
            <section>
              <h2 className="text-white text-lg font-semibold mb-3">1. Who We Are</h2>
              <p>
                OpenOrbis ("we", "us", "our") operates the Orbis platform, a service that helps
                professionals build and manage their career graph. This privacy policy explains how
                we collect, use, and protect your personal data in compliance with the General Data
                Protection Regulation (GDPR).
              </p>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">2. What Data We Collect</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="text-white/80">Account information:</strong> Your name, email address,
                  and profile picture from Google OAuth when you sign in.
                </li>
                <li>
                  <strong className="text-white/80">CV data:</strong> When you upload a CV (PDF), we extract
                  and store professional information including work experience, education, skills,
                  certifications, publications, projects, and languages.
                </li>
                <li>
                  <strong className="text-white/80">Manually entered data:</strong> Any professional information
                  you add directly through the platform (nodes, notes, and entries).
                </li>
                <li>
                  <strong className="text-white/80">Usage data:</strong> Anonymous analytics about how you
                  interact with the platform (page views, feature usage) to help us improve the service.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">3. How We Process Your Data</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="text-white/80">CV parsing:</strong> Uploaded CVs are processed using
                  Large Language Models (LLMs) — either locally hosted (Ollama) or cloud-based
                  (Anthropic Claude) — to extract structured professional data. The raw PDF is not
                  permanently stored; only the extracted structured data is retained.
                </li>
                <li>
                  <strong className="text-white/80">Graph storage:</strong> Your professional data is stored
                  in a Neo4j graph database. Sensitive fields (such as email addresses) are encrypted
                  at rest using Fernet symmetric encryption.
                </li>
                <li>
                  <strong className="text-white/80">Note enhancement:</strong> When you use the note
                  enhancement feature, your draft text is sent to an LLM to produce professional
                  CV-quality entries.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">4. Legal Basis for Processing</h2>
              <p>
                We process your personal data based on your <strong className="text-white/80">explicit consent</strong>,
                which you provide before creating any data on the platform. You may withdraw your
                consent at any time by contacting us.
              </p>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">5. Data Sharing</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  We do <strong className="text-white/80">not sell</strong> your personal data to third parties.
                </li>
                <li>
                  Your professional graph is <strong className="text-white/80">private by default</strong>.
                  It is only shared when you explicitly generate a share link.
                </li>
                <li>
                  When using cloud-based LLM providers (Anthropic Claude), your CV text is sent to
                  their API for processing. This data is subject to their respective privacy policies.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">6. Data Retention</h2>
              <p>
                Your data is retained for as long as your account is active. You may request
                deletion of your data at any time. Upon account deletion, all personal data
                (graph nodes, relationships, and associated metadata) will be permanently removed
                from our systems.
              </p>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">7. Your Rights</h2>
              <p className="mb-2">Under the GDPR, you have the right to:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong className="text-white/80">Access</strong> your personal data</li>
                <li><strong className="text-white/80">Rectify</strong> inaccurate data</li>
                <li><strong className="text-white/80">Erase</strong> your data ("right to be forgotten")</li>
                <li><strong className="text-white/80">Restrict</strong> processing of your data</li>
                <li><strong className="text-white/80">Data portability</strong> — export your data in a structured format (JSON)</li>
                <li><strong className="text-white/80">Withdraw consent</strong> at any time</li>
              </ul>
              <p className="mt-3">
                To exercise any of these rights, contact us at the email address below.
              </p>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">8. Security</h2>
              <p>
                We implement appropriate technical measures to protect your data, including:
                encrypted storage of sensitive fields, JWT-based authentication, HTTPS in transit,
                and access controls on our infrastructure. However, no system is 100% secure, and
                we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">9. Contact</h2>
              <p>
                For any privacy-related questions or to exercise your rights, contact us at:{' '}
                <a href="mailto:privacy@open-orbis.com" className="text-purple-400 hover:text-purple-300 underline">
                  privacy@open-orbis.com
                </a>
              </p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

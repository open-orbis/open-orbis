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
          <p className="text-white/30 text-sm mb-10">Last updated: 15 April 2026</p>

          <div className="space-y-8 text-white/60 text-sm leading-relaxed">
            <section>
              <h2 className="text-white text-lg font-semibold mb-3">1. Who We Are</h2>
              <p>
                OpenOrbis (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) operates the Orbis platform
                at <strong className="text-white/80">open-orbis.com</strong>, a service that helps professionals
                build and manage their career as an interactive knowledge graph. This privacy policy explains how
                we collect, use, and protect your personal data in compliance with the General Data Protection
                Regulation (GDPR) and applicable EU/EEA data protection laws.
              </p>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">2. What Data We Collect</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="text-white/80">Account information:</strong> Your name, email address,
                  and profile picture obtained via Google OAuth or LinkedIn OAuth when you sign in.
                </li>
                <li>
                  <strong className="text-white/80">CV data:</strong> When you upload a CV (PDF), we extract
                  and store professional information including work experience, education, skills,
                  certifications, publications, projects, languages, awards, outreach activities,
                  and training records.
                </li>
                <li>
                  <strong className="text-white/80">Manually entered data:</strong> Any professional information
                  you add directly through the platform (graph nodes, draft notes, and profile fields).
                </li>
                <li>
                  <strong className="text-white/80">Feedback and ideas:</strong> Text you submit through the
                  feedback form or idea submission feature.
                </li>
                <li>
                  <strong className="text-white/80">Usage analytics:</strong> We use Google Analytics
                  (measurement ID: G-7GKSGZ1YMM) to collect anonymous data about how visitors interact
                  with the platform, including page views, session duration, and device type. This data
                  is processed by Google LLC under their{' '}
                  <a href="https://policies.google.com/privacy" className="text-purple-400 hover:text-purple-300 underline" target="_blank" rel="noopener noreferrer">
                    privacy policy
                  </a>.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">3. How We Process Your Data</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="text-white/80">CV parsing:</strong> Uploaded CVs are processed using
                  Large Language Models (LLMs) via Google Vertex AI (Gemini) to extract structured
                  professional data. Processing runs asynchronously in the background via Google Cloud Tasks.
                  The original PDF is stored encrypted in Google Cloud Storage; the extracted structured data
                  is stored in our databases.
                </li>
                <li>
                  <strong className="text-white/80">Graph storage:</strong> Your professional data is stored
                  in a Neo4j graph database hosted on Google Cloud. Sensitive fields (email, phone, address)
                  are encrypted at rest using Fernet symmetric encryption (AES-128-CBC with HMAC).
                </li>
                <li>
                  <strong className="text-white/80">Tabular data:</strong> Job metadata, draft notes, version
                  snapshots, and document records are stored in a PostgreSQL database hosted on Google Cloud.
                </li>
                <li>
                  <strong className="text-white/80">Note enhancement:</strong> When you use the note
                  enhancement feature, your draft text is sent to an LLM to produce structured
                  CV-quality entries.
                </li>
                <li>
                  <strong className="text-white/80">Email notifications:</strong> We use Resend
                  (resend.com) to send transactional emails, including account activation, CV processing
                  completion, and access grant notifications. Resend processes your email address under
                  their{' '}
                  <a href="https://resend.com/legal/privacy-policy" className="text-purple-400 hover:text-purple-300 underline" target="_blank" rel="noopener noreferrer">
                    privacy policy
                  </a>.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">4. Legal Basis for Processing</h2>
              <p>
                We process your personal data based on your <strong className="text-white/80">explicit consent</strong>,
                which you provide via the GDPR consent gate before any data is written to the platform. You
                may withdraw your consent at any time by deleting your account or contacting us.
              </p>
              <p className="mt-2">
                For analytics (Google Analytics), the legal basis is our <strong className="text-white/80">legitimate
                interest</strong> in understanding how users interact with the platform to improve the service.
              </p>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">5. Data Sharing</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  We do <strong className="text-white/80">not sell</strong> your personal data to third parties.
                </li>
                <li>
                  Your professional graph is <strong className="text-white/80">restricted by default</strong>.
                  It is only shared when you explicitly change the visibility to public or generate a share
                  token, or invite specific people via email.
                </li>
                <li>
                  <strong className="text-white/80">Sub-processors:</strong> We use the following third-party
                  services to operate the platform:
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li><strong className="text-white/70">Google Cloud Platform</strong> (EU region: europe-west1) &mdash; infrastructure, Vertex AI (LLM), Cloud Tasks, Cloud Storage, Cloud SQL</li>
                    <li><strong className="text-white/70">Resend</strong> &mdash; transactional email delivery</li>
                    <li><strong className="text-white/70">Google Analytics</strong> &mdash; anonymous usage analytics</li>
                    <li><strong className="text-white/70">Firebase Hosting</strong> &mdash; static frontend hosting</li>
                  </ul>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">6. Data Retention</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="text-white/80">Account data:</strong> Retained for as long as your account is active.
                </li>
                <li>
                  <strong className="text-white/80">Account deletion:</strong> When you request account deletion, your account
                  enters a 30-day grace period during which you can recover it. After 30 days, all personal data (graph nodes,
                  relationships, uploaded documents, draft notes, snapshots, and metadata) is permanently deleted.
                </li>
                <li>
                  <strong className="text-white/80">CV processing jobs:</strong> Background job results are retained for
                  7 days after completion, then automatically deleted.
                </li>
                <li>
                  <strong className="text-white/80">Uploaded documents:</strong> Up to 3 documents per user. When a 4th is
                  uploaded, the oldest is automatically evicted.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">7. Your Rights</h2>
              <p className="mb-2">Under the GDPR, you have the right to:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong className="text-white/80">Access</strong> your personal data</li>
                <li><strong className="text-white/80">Rectify</strong> inaccurate data (edit your graph nodes directly)</li>
                <li><strong className="text-white/80">Erase</strong> your data (&ldquo;right to be forgotten&rdquo; &mdash; via account deletion in Settings)</li>
                <li><strong className="text-white/80">Restrict</strong> processing of your data</li>
                <li><strong className="text-white/80">Data portability</strong> &mdash; export your data as JSON or PDF via the export feature</li>
                <li><strong className="text-white/80">Withdraw consent</strong> at any time</li>
                <li><strong className="text-white/80">Lodge a complaint</strong> with your national data protection authority</li>
              </ul>
              <p className="mt-3">
                To exercise any of these rights, contact us at the email address below or use the
                account settings within the platform.
              </p>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">8. Security</h2>
              <p>
                We implement appropriate technical and organizational measures to protect your data, including:
              </p>
              <ul className="list-disc pl-5 space-y-2 mt-2">
                <li>Fernet symmetric encryption (AES-128-CBC) for sensitive fields (email, phone, address) at rest</li>
                <li>Encrypted document storage (PDF files encrypted before writing to disk/cloud)</li>
                <li>HTTPS/TLS for all data in transit</li>
                <li>HTTP-only, Secure cookies with SameSite protection for authentication</li>
                <li>JWT-based authentication with refresh token rotation</li>
                <li>OIDC-authenticated internal endpoints for background processing</li>
                <li>Rate limiting on authentication and upload endpoints</li>
                <li>Infrastructure hosted in Google Cloud EU region (europe-west1)</li>
              </ul>
              <p className="mt-2">
                No system is 100% secure, and we cannot guarantee absolute security. If you believe your
                account has been compromised, contact us immediately.
              </p>
            </section>

            {/* Cookie Policy */}
            <section>
              <h2 className="text-white text-lg font-semibold mb-3">9. Cookie &amp; Storage Policy</h2>
              <p className="mb-3">
                We use cookies and browser storage to provide essential functionality and improve your experience.
              </p>

              <h3 className="text-white/80 font-medium mb-2">Essential Cookies (strictly necessary)</h3>
              <p className="mb-2">These cookies are required for the platform to function and cannot be disabled.</p>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-xs border border-white/10 rounded-lg overflow-hidden">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5">
                      <th className="text-left px-3 py-2 text-white/70">Name</th>
                      <th className="text-left px-3 py-2 text-white/70">Purpose</th>
                      <th className="text-left px-3 py-2 text-white/70">Duration</th>
                      <th className="text-left px-3 py-2 text-white/70">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    <tr>
                      <td className="px-3 py-2 font-mono text-white/50">__session</td>
                      <td className="px-3 py-2">Authentication session (access JWT + refresh token)</td>
                      <td className="px-3 py-2">30 days</td>
                      <td className="px-3 py-2">HTTP-only cookie</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-white/80 font-medium mb-2">Local Storage (functional)</h3>
              <p className="mb-2">These values are stored in your browser to remember your preferences.</p>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-xs border border-white/10 rounded-lg overflow-hidden">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5">
                      <th className="text-left px-3 py-2 text-white/70">Key</th>
                      <th className="text-left px-3 py-2 text-white/70">Purpose</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    <tr>
                      <td className="px-3 py-2 font-mono text-white/50">orbis_tour_completed</td>
                      <td className="px-3 py-2">Tracks whether the guided tour has been completed</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-mono text-white/50">orbis_camera_distance</td>
                      <td className="px-3 py-2">Remembers your preferred 3D graph zoom level</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-mono text-white/50">orbis_filters</td>
                      <td className="px-3 py-2">Stores your keyword and node type filter preferences</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-mono text-white/50">orbis_note_target_lang</td>
                      <td className="px-3 py-2">Preferred language for note enhancement</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-white/80 font-medium mb-2">Analytics Cookies (third-party)</h3>
              <p className="mb-2">
                Google Analytics sets cookies to measure website traffic and usage patterns. These cookies
                collect anonymous, aggregated data.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border border-white/10 rounded-lg overflow-hidden">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5">
                      <th className="text-left px-3 py-2 text-white/70">Name</th>
                      <th className="text-left px-3 py-2 text-white/70">Purpose</th>
                      <th className="text-left px-3 py-2 text-white/70">Duration</th>
                      <th className="text-left px-3 py-2 text-white/70">Provider</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    <tr>
                      <td className="px-3 py-2 font-mono text-white/50">_ga</td>
                      <td className="px-3 py-2">Distinguishes unique visitors</td>
                      <td className="px-3 py-2">2 years</td>
                      <td className="px-3 py-2">Google</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-mono text-white/50">_ga_*</td>
                      <td className="px-3 py-2">Maintains session state</td>
                      <td className="px-3 py-2">2 years</td>
                      <td className="px-3 py-2">Google</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3">
                You can opt out of Google Analytics by installing the{' '}
                <a href="https://tools.google.com/dlpage/gaoptout" className="text-purple-400 hover:text-purple-300 underline" target="_blank" rel="noopener noreferrer">
                  Google Analytics Opt-out Browser Add-on
                </a>.
              </p>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">10. International Data Transfers</h2>
              <p>
                Your data is primarily processed and stored within the European Union (Google Cloud
                europe-west1 region). Some sub-processors (Google Analytics, Resend) may transfer data
                outside the EU/EEA under appropriate safeguards, including Standard Contractual Clauses
                (SCCs) and adequacy decisions.
              </p>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">11. Changes to This Policy</h2>
              <p>
                We may update this privacy policy from time to time. We will notify you of significant
                changes by posting a notice on the platform. Continued use of the service after changes
                constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">12. Contact</h2>
              <p>
                For any privacy-related questions, to exercise your data rights, or to report a concern, contact us at:{' '}
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

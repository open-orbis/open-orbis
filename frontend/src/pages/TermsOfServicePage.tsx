import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export default function TermsOfServicePage() {
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
          <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
          <p className="text-white/30 text-sm mb-10">Last updated: 23 April 2026</p>

          <div className="space-y-8 text-white/60 text-sm leading-relaxed">
            <section className="border border-yellow-500/30 bg-yellow-500/5 rounded-md p-4">
              <p className="text-yellow-300/80 text-xs">
                <strong className="text-yellow-200">Draft.</strong> This document is a structural
                placeholder pending legal review. Do not rely on it as final terms.
              </p>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">1. Acceptance</h2>
              <p>
                By creating an account or using OpenOrbis (&ldquo;Orbis&rdquo;,
                &ldquo;we&rdquo;, &ldquo;us&rdquo;) at{' '}
                <strong className="text-white/80">open-orbis.com</strong> you agree to these
                Terms of Service. If you do not agree, do not use the service.
              </p>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">2. Eligibility &amp; Beta Access</h2>
              <p>
                Orbis is currently in closed beta. Access requires an invitation code or admin
                approval. We may revoke access at any time without notice during the beta period.
              </p>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">3. Your Content</h2>
              <p>
                You retain ownership of all content you upload (CV, notes, graph data). You grant
                us a non-exclusive license to store, process, and display this content as required
                to operate the service. See the{' '}
                <a href="/privacy" className="text-white/90 underline">privacy policy</a> for
                details on data handling.
              </p>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">4. AI Processing</h2>
              <p>
                Orbis uses third-party AI providers (Anthropic Claude, Google Vertex AI, optional
                local Ollama) to extract and enhance graph content. By using the service you
                consent to your content being processed by these providers under their respective
                terms.
              </p>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">5. Third-Party Integrations</h2>
              <p>
                Orbis can be connected to third-party AI clients via the Model Context Protocol
                (MCP), including ChatGPT Apps and Claude Connectors. When you authorize a
                connection, the third-party client may read your Orbis data subject to the scope
                you granted (see{' '}
                <a href="/oauth/grants" className="text-white/90 underline">your active grants</a>
                ). You can revoke any grant at any time. Anthropic / OpenAI / Google process the
                data they receive under their own terms — Orbis is not responsible for their
                handling.
              </p>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">6. Service Limits &amp; Availability</h2>
              <p>
                The service is provided &ldquo;as is&rdquo; without warranty. We may impose rate
                limits, suspend accounts that abuse the service, and modify features without
                notice. Beta service availability is best-effort.
              </p>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">7. Termination</h2>
              <p>
                You may delete your account at any time from the account settings. We may
                terminate accounts that violate these terms or applicable law. On termination,
                we delete your personal data per the{' '}
                <a href="/privacy" className="text-white/90 underline">privacy policy</a>.
              </p>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">8. Liability</h2>
              <p>
                To the maximum extent permitted by law, our liability is limited to direct
                damages and capped at the fees paid to us in the 12 months preceding the claim.
                We are not liable for indirect, incidental, or consequential damages.
              </p>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">9. Changes to Terms</h2>
              <p>
                We may update these terms. Material changes will be communicated via email or in
                the application. Continued use after changes constitutes acceptance.
              </p>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">10. Governing Law</h2>
              <p>
                These terms are governed by the laws of Italy. Disputes are subject to the
                exclusive jurisdiction of the competent courts in Italy.
              </p>
            </section>

            <section>
              <h2 className="text-white text-lg font-semibold mb-3">11. Contact</h2>
              <p>
                Questions about these terms: <strong className="text-white/80">support@open-orbis.com</strong>.
              </p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

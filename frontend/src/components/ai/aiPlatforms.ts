// Per-platform MCP connection instructions, verified against each vendor's
// docs on the date below. When steps drift, update the copy here and bump
// LAST_VERIFIED — it is shown in the Connect panel footer so staleness is visible.
export const LAST_VERIFIED = '2026-05-27';

export type PlatformId =
  | 'claude'
  | 'chatgpt'
  | 'perplexity'
  | 'gemini'
  | 'lovable';

export interface Platform {
  id: PlatformId;
  name: string;
  icon: string;
  supportHint: string;
  authBadge: string;
  steps: string[];
  caveat?: string;
  docsUrl: string;
}

export const PLATFORMS: Platform[] = [
  {
    id: 'claude',
    name: 'Claude',
    icon: '🟣',
    supportHint: 'Easiest · OAuth',
    authBadge: 'OAuth · log in & consent',
    steps: [
      'In Claude, open Settings → Connectors (Pro or Max plan).',
      'Click the ＋ button, then "Add custom connector".',
      'Paste your Orbis MCP URL above and click Add.',
      'Complete the Orbis login & consent popup, then choose Full or Restricted access.',
    ],
    caveat:
      'On Team/Enterprise, an organization Owner must add the connector org-wide first. Claude connects via OAuth — no API key needed.',
    docsUrl:
      'https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp',
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    icon: '🟢',
    supportHint: 'Developer mode',
    authBadge: 'Developer mode (beta)',
    steps: [
      'In ChatGPT, go to Settings → Apps & Connectors → Advanced settings.',
      'Turn on Developer mode and accept the beta warning.',
      'Back in Apps & Connectors, click Create ("Add custom connector").',
      'Name it, paste your Orbis MCP URL, and create it. Enable it per chat from the ＋ menu.',
    ],
    caveat:
      'Requires a paid plan (Plus, Pro, Team, Enterprise). This is ChatGPT’s connector Developer mode — not the Apps SDK used to publish apps.',
    docsUrl:
      'https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt-beta',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    icon: '🔵',
    supportHint: 'OAuth / API key',
    authBadge: 'OAuth or API key',
    steps: [
      'Open Perplexity Settings → Connectors (Pro, Max, or Enterprise).',
      'Add a custom remote connector.',
      'Paste your Orbis MCP URL (must be HTTPS).',
      'Choose the authentication method (OAuth or API key) and confirm.',
    ],
    caveat:
      'Custom remote connectors launched March 2026; exact menu labels may vary by version.',
    docsUrl:
      'https://www.perplexity.ai/changelog/what-we-shipped---march-13-2026',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    icon: '✦',
    supportHint: 'Via Gemini CLI',
    authBadge: 'Gemini CLI',
    steps: [
      'Custom MCP servers are not yet supported in the standard Gemini app — use the Gemini CLI instead.',
      'Install the Gemini CLI, then run:  gemini mcp add --transport http orbis <your MCP URL>',
      'Start the CLI and run /mcp to confirm Orbis is connected.',
      'For OAuth or an API-key header, configure the mcpServers block in the CLI settings.json.',
    ],
    caveat:
      'No point-and-click setup in the consumer Gemini app. (Enterprise/Agentspace admins can add a custom MCP data store separately.)',
    docsUrl: 'https://geminicli.com/docs/tools/mcp-server/',
  },
  {
    id: 'lovable',
    name: 'Lovable',
    icon: '🧡',
    supportHint: 'Build a site from your Orbis',
    authBadge: 'Build-time connector',
    steps: [
      'In Lovable, open the connectors hub (Cmd/Ctrl+K → "connectors", or the ＋ menu).',
      'Add Orbis as a custom chat connector using your MCP URL.',
      'The Lovable Agent can now read your Orbis while it builds your app.',
      'Prompt it to build your site (see the prompts in the next step).',
    ],
    caveat:
      'Lovable’s MCP chat connectors feed the builder at build time — they are not bundled into the deployed site. For live Orbis data in the shipped site, use Lovable’s app-connector / API integration instead.',
    docsUrl: 'https://docs.lovable.dev/integrations/introduction',
  },
];

export interface StarterPrompt {
  text: string;
  // When set, the prompt is only shown after that platform is selected.
  platformId?: PlatformId;
}

export const STARTER_PROMPTS: StarterPrompt[] = [
  {
    text: "Given my Orbis, what's the best-fitting job opportunity for me right now? Then draft a CV tuned to that job description.",
  },
  {
    text: 'Draft a short professional bio of me based on my specialities and experience.',
  },
  {
    text: 'Write a cover letter for this role, using my Orbis: [paste the job description].',
  },
  {
    text: 'Build my personal portfolio site using my Orbis as the source of truth.',
    platformId: 'lovable',
  },
];

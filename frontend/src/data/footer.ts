/**
 * Textual content and links for the landing page footer.
 * Extracted into a separate file for easier maintenance.
 */

export const FOOTER_CONTENT = {
  brand: {
    name: "OpenOrbis",
    tagline: "Your career as a knowledge graph.\nReimagined for the AI era.",
    copyrightOwner: "Open Orbis",
  },
  links: [
    { label: "Privacy Policy", to: "/privacy", isInternal: true },
    { label: "Contact us", href: "mailto:team@open-orbis.com" },
    {
      label: "GitHub",
      href: "https://github.com/Brotherhood94/orb_project",
      isExternal: true,
    },
  ],
};

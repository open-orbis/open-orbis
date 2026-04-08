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
  sections: [
    {
      title: "Links",
      links: [
        { label: "About", to: "/about", isInternal: true },
        { label: "Privacy Policy", to: "/privacy", isInternal: true },
      ],
    },
    {
      title: "Contact",
      links: [
        { label: "Email", href: "mailto:team@open-orbis.com" },
        {
          label: "GitHub",
          href: "https://github.com/Brotherhood94/orb_project",
          isExternal: true,
        },
      ],
    },
  ],
};

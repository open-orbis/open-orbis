# Spec: Add Contact Information Footer to the Landing Page (#139)

## Objective
The goal of this task is to enhance the `LandingPage.tsx` with a comprehensive footer. This footer will provide users with essential links (About, Privacy Policy, GitHub), contact information, and a copyright notice. This improvement will increase professional credibility and provide clear navigation for legal and contact purposes.

### Success Criteria:
- Footer is added to the bottom of the landing page.
- Responsive design: looks good on both desktop and mobile.
- Links are functional:
  - Email: `mailto:hello@open-orbis.com`
  - GitHub: `https://github.com/Brotherhood94/orb_project`
  - About: `/about`
  - Privacy Policy: `/privacy`
- Copyright notice is present and reflects the current year (2025).
- Consistent styling with the existing landing page theme (dark theme, Tailwind 4, Framer Motion).

## Tech Stack
- **Framework:** React 19
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4
- **Animations:** Framer Motion (for consistency with the rest of the landing page)

## Commands
- **Dev:** `npm run dev` (run from `frontend/`)
- **Build:** `npm run build` (run from `frontend/`)
- **Lint:** `npm run lint` (run from `frontend/`)

## Project Structure
- `frontend/src/pages/LandingPage.tsx` → The primary file to be modified.
- `frontend/src/components/landing/Footer.tsx` → (Optional) If the footer becomes complex, it might be extracted as a separate component.

## Code Style
The implementation should match the existing style in `LandingPage.tsx`, utilizing Tailwind CSS 4 classes and maintaining the dark/purple aesthetic.

```tsx
// Example of footer link styling consistent with the page
<a 
  href="/about" 
  className="text-white/40 hover:text-white/80 transition-colors text-sm"
>
  About
</a>
```

## Testing Strategy
- **Manual Verification:** 
  - Verify that the footer is correctly positioned at the bottom of the page.
  - Test all links (About, Privacy, GitHub, Email) to ensure they work.
  - Check responsiveness on different screen sizes.
- **Automated Testing:** 
  - (Optional) Add a simple Playwright test to verify footer presence and link visibility.

## Boundaries
- **Always:** Use Tailwind CSS 4 for all styling. Maintain the current color palette (black background, purple accents).
- **Ask first:** Before adding any new dependencies (like icon libraries).
- **Never:** Use hardcoded absolute URLs for internal links (use `react-router-dom` or relative paths). Do not use an email other than `hello@open-orbis.com` unless specified.

## Success Criteria
- [ ] Footer component is implemented and rendered at the bottom of `LandingPage.tsx`.
- [ ] "About" and "Privacy Policy" links correctly navigate to their respective pages.
- [ ] GitHub link opens the repository in a new tab.
- [ ] Email link opens the default mail client.
- [ ] Footer layout is responsive (stacks on mobile, side-by-side on desktop where appropriate).
- [ ] `npm run lint` passes in the `frontend` directory.

## Task Breakdown

### Phase 1: Foundation
#### Task 1: Create Footer Component Structure
**Description:** Create a new standalone component for the footer to keep `LandingPage.tsx` clean.
**Acceptance criteria:**
- [ ] `frontend/src/components/landing/Footer.tsx` is created.
- [ ] Component exports a functional React component.
- [ ] Basic HTML structure (footer tag, container) is established.
**Verification:**
- [ ] File exists and is importable.
**Files likely touched:**
- `frontend/src/components/landing/Footer.tsx`
**Estimated scope:** XS

#### Task 2: Integrate Footer into Landing Page
**Description:** Import and render the `Footer` component at the bottom of the main landing page.
**Acceptance criteria:**
- [ ] `Footer` is imported in `frontend/src/pages/LandingPage.tsx`.
- [ ] `<Footer />` is rendered as the last element in the page container.
**Verification:**
- [ ] Footer is visible at the bottom of the page when running `npm run dev`.
**Files likely touched:**
- `frontend/src/pages/LandingPage.tsx`
**Estimated scope:** XS

### Phase 2: Implementation & Styling
#### Task 3: Add Links and Content
**Description:** Populating the footer with the required links and the copyright notice.
**Acceptance criteria:**
- [ ] "About" and "Privacy Policy" links use `react-router-dom` or relative paths.
- [ ] GitHub link has `target="_blank"` and `rel="noopener noreferrer"`.
- [ ] Email link uses `mailto:hello@open-orbis.com`.
- [ ] Copyright notice shows "© 2025 Open Orbis".
**Verification:**
- [ ] All links are functional and point to correct destinations.
**Files likely touched:**
- `frontend/src/components/landing/Footer.tsx`
**Estimated scope:** S

#### Task 4: Apply Styling and Responsiveness
**Description:** Use Tailwind CSS 4 to ensure the footer matches the dark/purple aesthetic and is responsive.
**Acceptance criteria:**
- [ ] Footer background and text colors match the landing page theme.
- [ ] Links have hover effects (e.g., `text-white/80`).
- [ ] Layout stacks vertically on mobile and uses a multi-column grid or flexbox on desktop.
- [ ] (Optional) Entry animation using Framer Motion matches existing page elements.
**Verification:**
- [ ] Visual inspection on desktop and mobile viewports.
**Files likely touched:**
- `frontend/src/components/landing/Footer.tsx`
**Estimated scope:** S

### Phase 3: Validation
#### Task 5: Final Verification and Linting
**Description:** Ensure code quality and adherence to project standards.
**Acceptance criteria:**
- [ ] `npm run lint` passes without errors in the `frontend` directory.
- [ ] `npm run build` succeeds.
**Verification:**
- [ ] Lint and build commands output success.
**Files likely touched:**
- None
**Estimated scope:** XS

## Open Questions
- Should the footer be extracted to a separate component file in `src/components/landing/`? (Decided: Yes, in Task 1)
- Are there specific icons requested for GitHub and Email, or should we use simple text/SVG icons?

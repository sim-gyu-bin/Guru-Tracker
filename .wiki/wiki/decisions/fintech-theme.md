---
title: Fintech Reference Audit and System Theme
status: decided-with-open-questions
decision_record:
  - project conversation, 2026-09-21
observed: 2026-09-21
updated: 2026-09-21
---

# Fintech Reference Audit and System Theme

## Decision and scope

The user requested a deep audit of the UI UX Pro Max fintech demo before further screen design. This iteration covers the audit, shared project theme cleanup, system-only color mode, and Wiki documentation. It does not redesign the login composition or add a landing page. The login keeps its service name, two Google OAuth entry buttons, approval notice, and policy links. Authentication and disclosure behavior are unchanged.

The reference is a visual input, not a product template or a permanent requirement to copy another brand. No CryptoVault logo, financial data, wallet UI, certifications, user counts, or security claims are adopted. The original user-provided prompt is preserved below as provenance, not installed in global agent instructions:

> Create a dark mode fintech/crypto landing page with glassmorphism cards, real-time price charts preview, security features highlight, wallet integration showcase, and trust indicators. Focus on security and modern tech feel.

## Evidence and method

- [Rendered reference](https://uupm.cc/demo/fintech-crypto).
- [Page-specific CSS observed on 2026-09-21](https://uupm.cc/_next/static/chunks/981d62468021d495.css). This build-hashed URL may change.
- Real Chromium computed styles and screenshots at 1440×1000 and 390×844; responsive measurements at widths 320, 640, 768, 1024, and 1440.
- Actual pointer hover on primary/secondary buttons and a feature card; system-light and reduced-motion emulation; DOM/SVG and active animation inspection.
- Project-local `ui-ux-pro-max` search `hover reduced motion` returned guidance to respect reduced motion, avoid hover-only interactions on touch, and limit simultaneous motion. Search output is guidance, not proof of implementation quality.

All reference measurements below are observations, not estimates. Project mappings and omitted features are explicit design decisions.

## Observed reference: color roles

| Role | Value | Meaning |
| --- | --- | --- |
| Page | `#0A0E27` | Deep navy, not the former project `#070D18` |
| Card | `#0F1635` | Raised navy surface |
| Card hover | `#141B42` | Brighter blue-navy surface |
| Main text | `#FFFFFF` | Headings and main content |
| Muted text | `#8B92B3` | Descriptions and secondary labels |
| Border | `#1E2650` | Low-contrast structural separation |
| Reference `--primary` | `#0080FF` | Blue interaction, selected chart period, card hover |
| Reference `--secondary` / `--cta` | `#39FF14` | Neon-green CTA, positive marks, chart line |
| CTA text | `#0A0E27` | Dark text over neon green |
| Heading gradient | `135deg`, blue → neon green | Clipped text, not a cyan solid fill |

The reference's `primary` means blue, whereas shadcn's primary button role means the main action. Copying variable names literally would therefore make the wrong button color. Guru Tracker maps the dark CTA to `--primary` and blue interaction to `--interactive`.

## Observed reference: background and surfaces

- Hero grid: two perpendicular linear gradients, 1px lines in `rgba(30,38,80,.3)`, repeating every 50×50px. It belongs to the hero, not every surface.
- Hero ambient light: a 288×288px blue circle, blur 128px, opacity .2, positioned top 80px / left 40px; a green equivalent with opacity .1 at bottom 80px / right 40px. These are static, not moving gradients.
- Statistics section uses similar 256×256px ambient circles.
- Glass: `rgba(15,22,53,.8)` fill, `rgba(30,38,80,.5)` 1px border, backdrop blur 20px, radius 16px. Blur and translucency are separate properties; a transparent card alone is not the same effect.
- Feature-card hover: 300ms, fill `rgba(20,27,66,.9)`, blue border, `0 0 30px rgba(0,128,255,.15)` shadow. No vertical movement was observed.
- Static blue/green glow utility: `0 0 20px` at .3 opacity. Floating chart chips are absolutely positioned overlapping cards; the active-animation inspection did not show a floating animation on them.
- Some rendered cards also receive the site's shared two-layer shadow (`0 4px 6px -1px rgba(0,0,0,.4)`, `0 2px 4px -2px rgba(0,0,0,.3)`). This is a computed site-level effect, not in the page-specific glass rule.
- Header: fixed, 65px high at desktop, page color at .8 opacity, backdrop blur 12px, bottom border. This navigation pattern is not needed on login.

## Observed reference: typography and spacing

| Element | Desktop | Mobile / responsive |
| --- | --- | --- |
| Heading family | Space Grotesk | Same |
| Body / button family | DM Sans | Same |
| Hero h1 | 60px / 75px, weight 700 | 30 / 37.5 at 320–390; 36 / 45 at 640; 48 / 60 at 768; 60 / 75 at ≥1024 |
| Section h2 | 36px / 40px, weight 700 | 24px base, 30px at sm, 36px at md |
| Feature h3 | 18px / 28px, weight 600 | Same |
| Hero body | 18px / 28px | Same |
| Main CTA | 16px / 24px, weight 600 | Same |
| Secondary CTA | 16px / 24px, weight 500 | Same |
| Header CTA | 14px / 20px, weight 600 | Hidden with desktop navigation on small screens |
| Small labels | 12–14px | Not the scale of the main action |

Hero title tracking computes to `normal`; the former project login's negative tracking and 24px title are not measurements from the reference. A login title need not inherit a marketing hero's 60px size; its final size remains part of the deferred composition work, not an implicit match claim.

- Main container max-width 1280px; horizontal padding 16 / 24 / 32px at base / sm / lg.
- Hero grid is single-column below 1024px and two equal columns above it, with 32px base gap / 48px from sm.
- Hero vertical padding 64px top / 48px bottom at mobile; 96px / 80px from sm. General sections use 48px / 80px vertical spacing.
- Glass card padding 24px, compact cards 16px, card radius 16px, button radius 12px.
- Mobile primary CTA fills the 358px content width at viewport 390 and measures 52px high. Secondary CTA includes its border. No horizontal overflow was observed at the five measured widths.
- Footer uses grouped navigation and secondary text rather than more promotional graphics. Its layout and links are not adopted.

## Observed reference: interaction and motion

| Target | Rest | Hover |
| --- | --- | --- |
| Primary CTA | Neon green, no glow, 14px vertical / 32px horizontal padding | Same fill; translateY(-2px); `0 0 30px rgba(57,255,20,.4)`; 200ms |
| Secondary CTA | Transparent; 1px structural border | Blue border; `rgba(0,128,255,.1)` fill; 200ms; no lift |
| Feature card | Glass fill/border | Brighter glass, blue border/glow; 300ms; no lift |
| Header links | Muted text | Main text; 150ms color transition |

The page-specific button/card CSS uses `transition: all` (default easing `ease`). The project will transition only the affected properties. Hover feedback must not carry essential information or become sticky on touch devices.

A small live-status dot is the only active continuous animation identified in the inspected page: 2s `pulse`, opacity 1→.5→1. SVG chart paths use a 2px rounded neon-green line and green area fill fading from .3 opacity to 0; its 300×120 viewBox stretches with `preserveAspectRatio="none"`. This is presentation evidence, not proof of a real-time market feed. No animation or data-source claim is imported into Guru Tracker.

The reference has a reduced-motion rule reducing transition/animation duration to .01ms and iterations to 1. That rule does not itself remove the hover transform. Guru Tracker will suppress the lift entirely under reduced motion while retaining immediate color/focus feedback. Dedicated disabled/error/keyboard-focus contracts are not defined in this page-specific reference stylesheet; retain accessible shadcn states instead of inferring missing ones.

## Project theme mapping

### Decided shared tokens

| Token role | Dark | Light (project adaptation, not reference evidence) |
| --- | --- | --- |
| Background | `#0A0E27` | `#F2F4F8` |
| Foreground | `#FFFFFF` | `#0D1A2B` |
| Card | `#0F1635` | `#FFFFFF` |
| Primary action | `#39FF14` | `#137A08` |
| Primary foreground | `#0A0E27` | `#FFFFFF` |
| Muted foreground | `#8B92B3` | `#55617A` |
| Structural border | `#1E2650` | `#D7DEE8` |
| Interactive blue / focus | `#0080FF` | `#0066CC` |
| Interactive wash | blue at .1 | blue at .07 |
| Primary hover glow | neon green at .4, 30px | dark green at .18, 30px |
| Glass fill / border | card at .8 / border at .5 | white at .9 / border at .8 |
| Ambient blue / green | blue .2 / neon green .1 | blue .07 / dark green .09 |

The reference remains dark even under emulated system light, so it supplies no light palette. Using neon green as small text or a white-text button in light mode would not preserve contrast. The light action is deliberately darker; this is not represented as an exact demo copy.

Existing disclosure chart categorical colors, success/warning/destructive roles, compact controls, and body density are retained rather than recolored into a misleading all-green market theme. `--primary` must not be assumed to mean investment gain. The common `lg` button uses 16px text and a 52px minimum height; compact variants retain their current sizes. Default action hover adopts the 2px lift/glow, outline uses blue border/wash, and motion-reduce disables movement. Static login glass consumes shared surface tokens; no global `.glass-card` or `.btn-primary` CSS class is introduced.

The initial theme-only iteration retained Pretendard and Space Grotesk with a 14px body. This historical typography was superseded by the Pretendard refinements below.

### Historical system-only mode — superseded below

- CSS `prefers-color-scheme` controls token values, Tailwind `dark:` utilities, chart theme overrides, native `color-scheme`, and media-specific browser `theme-color`.
- No manual selector, theme provider, hydration-time class injection, or persisted user override remains in the active app.
- Old `guru-tracker-theme` browser storage is ignored, not deleted. An old stored light/dark value cannot override the operating system.
- The user explicitly approved deleting the two manual-theme components and removing `next-themes`.
- Server HTML remains stable; mode is correct before hydration and when JavaScript is disabled. Runtime OS changes follow the media query directly.
- `globals.css` holds shared tokens and minimal base styles only. Component variants remain Tailwind in shadcn components. Theme mode must not leave a `.dark`-only chart selector behind.

## Implementation and verification status

In the initial shared-theme iteration, the shared tokens, glass surface, primary/outline button states, and CSS-only system appearance were applied locally. The approved obsolete provider, selector, and `next-themes` dependency were removed. Authentication and screen composition were intentionally left unchanged in that iteration.

Local Chromium verification on 2026-09-21:

- Desktop 1440×1000 dark login and mobile 390×844 light / 320×740 dark login were visually checked; no horizontal overflow occurred. Login buttons measured 52px high with 16px text.
- With the old `guru-tracker-theme` value still set to `light`, system dark rendered `rgb(10, 14, 39)` immediately after reload. Switching system appearance changed the page without a theme selector. JavaScript-disabled reload also rendered dark and retained both authentication entry buttons.
- Primary hover retained `#39FF14`, moved upward 2px, and produced a 30px green glow at alpha 0.4 over 200ms. Outline hover used a blue border and 10% blue wash without movement. Reduced motion computed `transition-property: none` and `translate: none`.
- The public privacy page was visually checked at 390px wide in dark mode without horizontal overflow. A browser navigation probe stalled after disabling JavaScript; a fresh tab successfully verified the page.
- Actual `ChartStyle` server rendering with distinct light/dark colors emitted the default scoped variable and a dark media-query override. Authenticated chart screens were not exercised.
- Calculated sRGB contrast: light CTA 5.50:1, dark CTA 14.02:1, and dark muted text against the card 5.78:1. These are token-pair checks, not a claim of a full accessibility audit.
- `pnpm lint` passed TypeScript checking and Biome lint for 91 files. No production deployment, real-account OAuth exercise, or final approval of a redesigned login is claimed.

## Representative disclosure layouts — 2026-09-21

The user subsequently approved implementation of `/main` and the Stanley detail only, with a direction review before expanding to other screens. The official upstream `ui-ux-pro-max` search informed a data-dense disclosure layout. Its marketing-oriented Enterprise Gateway pattern was rejected as unsuitable; suggested replacement colors and fonts were not adopted.

- Home separates three connected disclosure destinations from four unconnected people. Source identity and relevant filing/report dates remain visible on mobile.
- Stanley prioritizes report date and filing date, then manager, accession, last successful update, and official filing/information-table links. The existing allocation chart, desktop table, mobile holding cards, and disclosure interpretation constraints remain.
- Existing theme tokens, CSS-only light/dark, shared shell, fonts, and dependencies were retained. Authentication, data semantics, collectors, and synchronization were not changed.
- Actual page components were rendered with synthetic fixtures in an in-memory isolated Chromium harness. Both routes had no horizontal overflow at 320, 390, 844, and 1440px; light/dark desktop and mobile surfaces were visually checked. Empty, error, and unconfigured states were checked at 390px. The home destination card displayed a keyboard focus outline and navigated to Stanley.
- `pnpm lint` passed TypeScript and Biome checks for 91 files. The harness substituted server data and routing adapters; this is not authenticated Next.js integration, real holdings, production, or synchronization verification.

The user subsequently approved the representative direction and the shared navigation/theme refinement below. Login and administration layouts were not redesigned.

## Pretendard typography refinement — 2026-09-21

The user selected Pretendard as the project font rather than the reference's Space Grotesk / DM Sans pairing. Titles, body copy, and numeric displays use the existing local Pretendard Variable; numeric alignment retains `tabular-nums`. Space Grotesk loading and its display token were removed, but its existing font and license files were preserved.

The base body becomes 16px. Representative pages use 30/36px page titles, 22/24px section titles, 18px card titles and introductory copy, and 14px table/secondary text. Padding, gaps, wrapping, and the home-card breakpoint are adjusted with the larger type. The shared allocation chart adopts the section-title and readable legend scale; other routes receive font-family changes without a full layout redesign.

Verification: `pnpm lint` passed TypeScript and Biome checks (91 files). Browser measurements of the actual representative components with synthetic disclosure fixtures confirmed the specified heading sizes and no document-level horizontal overflow at 320, 390, 844, and 1440px. Light/dark screenshots were reviewed, including narrow-screen long issuer names and numeric values. Empty, error, and unconfigured states rendered in the isolated harness. The real Next.js login page independently confirmed Pretendard and the 16px body baseline; authenticated data integration was not exercised. No remaining `font-display` or `font-mono` usages were found under `src`.

## Approved navigation and theme refinement — 2026-09-21

The user approved the direction informed by [shadcn's directory](https://ui.shadcn.com/docs/directory). Observed reference sizes were 30px/600 for the page title, 14px/500 for desktop navigation, and 24px/500 for open mobile navigation. These are reference observations, not a claim that its theme control offers our three choices.

- Retain Pretendard and existing color tokens. Home and the three connected detail titles use 30px/600; section headings use 20px/600. This supersedes the preceding 30/36px and 22/24px scale without redesigning the other detail layouts.
- At widths up to 760px, a left header button opens a full-height, scrollable Radix sheet with 24px/500 navigation. Connected destinations close the panel on selection; unconnected people remain labeled. Administrator visibility and logout POST semantics are unchanged.
- The header offers light, dark, and system. System is the default; explicit choices persist under `guru-tracker:theme:choice`. Only system follows OS changes. Invalid or inaccessible storage falls back to system. The historical storage key remains untouched.
- A synchronous script before page content resolves the root class, native color scheme, and browser theme color before hydration. Shared tokens, dark utilities, and chart overrides use the same `.dark` contract. No theme dependency was added.
- Verification: `pnpm lint` passed TypeScript and Biome for 96 files. Actual components with synthetic data showed no horizontal overflow at 320, 390, 844, and 1440px; mobile and desktop screenshots were reviewed. A 320×568 menu retained focus within the dialog and navigated to Stanley with the panel closed. Escape restored trigger focus. Theme selection persisted after reload and manual light survived system dark; system followed OS changes.
- The real Next.js login independently retained the selected light mode with external hydration scripts blocked, then hydrated without theme mismatch errors. Invalid and blocked storage used system dark and followed a switch to light. This does not verify real-account authentication, DB data, or synchronization.

## Current header and home-body refinement — 2026-09-21

The user subsequently replaced the three-choice theme control with a binary toggle of the resolved light/dark mode. Initial system resolution and persisted overrides remain; a separate system option is no longer displayed. The theme button stays neutral, while other header actions retain the green accent. This supersedes the selector description above.

The approved home-body refinement keeps Pretendard, existing data and text, and the header unchanged. Only the word preceding “조회” receives a blue-to-green gradient. A static soft ambient background, tinted initial tiles, source badges, and the connected-count badge repeat the color language. Connected cards emphasize hover and keyboard focus; unavailable targets remain neutral. No performance numbers, chart data, or real-time disclosure claims were introduced.

Verification: actual components rendered with synthetic fixtures at 1440px desktop and 375px mobile in light and dark. No horizontal overflow was observed; the empty state retained explicit missing-data text, and connected-card keyboard focus remained visible. `pnpm lint` passed TypeScript and Biome for 96 files. This does not establish real-account, database, or synchronization integration.

## Deferred / open questions

- Login title scale, proportions, spacing, grid/ambient composition, and full visual redesign are outside this iteration.
- Hero grid and card hover patterns are documented, not automatically applied to every screen. Non-interactive disclosure cards must not suggest clickability.
- Authenticated integration and administration visuals still need a normal approved session. The isolated representative-component review above does not replace that check. Do not bypass access control for design verification.
- Source CSS URLs are build-specific; remeasure if the external demo changes.
- Do not promote the original prompt to global instructions until the user explicitly approves the resulting direction.

## Sources

- User conversation, 2026-09-21: audit first, shared theme and Wiki only, system-only mode, explicit removal approval.
- User conversation, 2026-09-21: representative home and Stanley redesign, existing theme retained, review before expansion.
- Rendered demo and its page-specific CSS linked above: external design observations only.
- Repository `src/app/globals.css`, `src/app/layout.tsx`, `src/app/(public)/login/page.tsx`, `src/components/ui/button.tsx`, `src/components/ui/chart.tsx`: implementation boundaries.
- Repository `.omp/skills/ui-ux-pro-max/SKILL.md`: locally installed official upstream guidance; project constraints remain separate.
- [Technology stack](technology-stack.md), [product direction](../product/product-direction.md), [system overview](../architecture/system-overview.md).

No human-owned `.wiki/raw` content was created, modified, or replaced.

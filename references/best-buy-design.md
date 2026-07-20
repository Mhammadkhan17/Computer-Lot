---
version: alpha
name: "Best Buy"
website: "https://www.bestbuy.com"
description: >-
  A US consumer-electronics retailer whose marketing chrome turns the brand price-tag into a system primitive — the top-nav band is a flat saturated cobalt blue carrying a yellow tag-shaped logomark, and the above-fold promotional billboard runs a blue-to-teal gradient with a giant condensed display headline in highlighter yellow. Type runs Human BBY Digital across the body and Human BBY Digital Condensed at 80px / weight 300 for the promotional shout, letting a single condensed display tier do the work most retailers split between bold sans and serif. Cobalt #0457c8 carries 211 occurrences as link and selection color while the structural chrome remains near-black ink #040c13 on neutral grey surfaces; the yellow #fff200 is the scarcity moment, scoped to in-banner price tags and the inline "Ends 5/25" date pill.

seo:
  title: "Best Buy Design System for React — cobalt blue, Human BBY Digital, 18 components"
  metaDescription: "Best Buy's marketing chrome packaged as a DESIGN.md file. Cobalt #0457c8 nav, blue-to-teal gradient promo banners, highlighter-yellow price-tag accents, Human BBY Digital, 16 colors, 18 components. For React, Next.js, and AI tools."
  highlights:
    - "Price-tag as logomark — the yellow tag in the wordmark, the tag-shaped sale chip, and the promotional yellow on blue all derive from the same physical retail prop"
    - "Cobalt nav, gradient billboards — the top-nav is flat #0457c8 cobalt, the in-page promo cards run a blue-to-teal gradient that no peer big-box retailer uses"
    - "Condensed display, weight 300 — 80px Human BBY Digital Condensed at weight 300 is the promotional shout; the rest of the page sits at 11-20px / weight 400-600"
    - "Highlighter yellow as price-tag voltage — #fff200 appears only inside Memorial Day Sale chips and the date-pill, scoped tightly and never as body text"
    - "Skeleton-first lazy load — the captured page shows greyed-out placeholder blocks below the fold where product modules hydrate; the structure narrates the lazy-load pattern"
  tags:
    - "E-commerce & Retail"
    - "Consumer Electronics"
  lastUpdated: "2026-05-19"
  author:
    name: "Dov Azencot"
    url: "https://x.com/dovazencot"
  opening: |
    Best Buy's homepage is what happens when a 50-year-old big-box retailer commits to a single physical-world primitive and runs the entire chrome on it. The brand mark is a yellow rectangular price tag with "BEST BUY" stamped across it; the top-nav is a flat cobalt band the same hue as the logo's background; the above-fold promotional billboard is a blue-to-teal gradient block carrying an 80px condensed yellow display headline that reads "MEMORIAL DAY SALE" with a tag-shaped "Ends 5/25" date chip beneath. The yellow tag is everywhere or nowhere — never a generic accent, always price-coded. Where Amazon trusts a smile-arrow icon to do almost no decorative work and Walmart leans on a spark and pure white, Best Buy paints the chrome in retail-banner saturation and lets the typography shout.

    The DESIGN.md file packages the marketing surface into a machine-readable spec. Inside: 16 color tokens drawn from a structural near-black ink, a cobalt link voltage, three tiers of grey, a scarcity yellow, and the promotional gradient end-stops; 12 typography tokens running Human BBY Digital (the proprietary brand sans) at 11-20px for chrome and Human BBY Digital Condensed at 80px / weight 300 for the promotional headline; 5 corner-radius tokens centered on 4px with full pills for action buttons; 9 spacing values on an 8px base; and 18 component definitions covering the cobalt nav band, the gradient promo card, the tag-shaped date chip, the circular category-puck rail, skeleton placeholders, and the standard ecommerce inventory.

    Feed this file to an AI coding tool and it reproduces Best Buy's specific moves: cobalt-blue nav rather than charcoal, a blue-to-teal gradient promotional band instead of flat brand-color blocks, condensed display at weight 300 for in-page billboards, and the scarcity yellow scoped to in-banner price tags only. The one move worth borrowing only if your retail mark has a physical-world referent: the tag-as-logomark coherence. Most marks are abstract symbols; the Best Buy tag works because every yellow rectangle on the page reads as "this is a price."
  related:
    - href: "/design"
      title: "Browse all design systems"
      description: "The full directory of DESIGN.md files on shadcn.io, with live mockups for each."
    - href: "https://www.bestbuy.com"
      title: "Best Buy — official site"
      description: "Best Buy's public marketing site — the source of truth for the live tokens captured in this file."
    - href: "https://github.com/google-labs-code/design.md"
      title: "The DESIGN.md specification"
      description: "Google Labs' open spec for machine-readable design system files — the format this page is built on."
  questions:
    - id: "primary-color"
      title: "What is Best Buy's primary brand color?"
      answer: "Best Buy's brand voltage is cobalt blue #0457c8, wired into the page as --colorRolePrimary600, --color-unstable-link-blue, --colorBgPrimary, and a chain of seventeen other CSS custom-property aliases. It appears 211 times in the captured page — 108 as text (every link and price label), 103 as border, and across the top-nav band as the dominant background fill. The page also exposes a deeper navy #013196 wired as the dark mode primary, plus the scarcity yellow #fff200 reserved for promotional price-tag chips. The cobalt does the brand-voltage job; the yellow does the retail-banner job. They never share a surface unless one is sitting on top of the other inside a sale graphic."
    - id: "typography"
      title: "What typeface does Best Buy use, and what should I use as a substitute?"
      answer: "Best Buy ships two proprietary sans families. Human BBY Digital carries every chrome surface — nav links at 13px / 400, body paragraphs at 14px / 500, h3 product titles at 15px / 600, h2 section heads at 20px / 500. Human BBY Digital Condensed handles the single promotional shout: the 80px / weight 300 in-banner Memorial Day Sale headline. The condensed display at weight 300 is the move to preserve — most retailers reach for weight 700+ condensed for promotional headlines, and the lighter weight reads as confident rather than panicked. The closest open-source substitutes are Inter for Human BBY Digital and Oswald or Barlow Condensed for the condensed display family."
    - id: "scarcity-yellow"
      title: "Why does Best Buy use such a saturated yellow?"
      answer: "The highlighter-bright #fff200 yellow is not a brand accent — it is the price-tag voltage. The yellow appears five times in the captured marketing surface, all inside the Memorial Day Sale promotional banner: the condensed display headline, a small tag-shaped 'Ends 5/25' date chip, and the yellow rectangle inside the wordmark itself. It is never used for hover states, badges, focus rings, or any structural chrome role. The discipline is intentional — when every yellow object on the page is price-coded, the customer reads 'sale' instantly without needing a 'SALE' label. Yellow is reserved for the moment of urgency."
    - id: "gradient-billboards"
      title: "Why do Best Buy's promo banners use a blue-to-teal gradient?"
      answer: "The two above-fold promotional cards (Memorial Day Sale and APPLIANCES Memorial Day Sale) both render a left-to-right gradient from cobalt #0457c8 through #2b4cb6 (a slightly violet blue) to a teal-cyan #7fd8ff in the upper-right. The structural rest of the page sits on flat white #ffffff and neutral grey #e4e5e8 surfaces; the gradient is reserved for the promotional moments. The teal end-stop is a fresh-summer signal — paired with the 'Bring on summer with big tech deals' lead — and the cobalt-to-teal range communicates 'tech meets seasonal' without needing additional iconography. No peer big-box retailer runs a gradient on its sale banners; Best Buy is the outlier."
    - id: "skeleton-first"
      title: "Why does the captured Best Buy homepage show grey placeholder blocks?"
      answer: "The page lazy-loads its product modules using skeleton-first hydration — grey rectangles render immediately and product cards swap in as their data resolves. The captured screenshot shows the page mid-hydration, with the above-fold promotional banners and category-puck rail fully painted while the deal carousels below render as #e4e5e8 placeholder blocks. The DESIGN.md captures the skeleton tokens (canvas surface #f3f4f6, placeholder fill #e4e5e8) as first-class component definitions because they are visible on every cold-load of the page; they are part of the chrome, not an edge-case loading state."
    - id: "use-in-project"
      title: "Can I use this DESIGN.md to build my own retail marketing site?"
      answer: "Yes — the file is designed to be fed into Claude, Cursor, or any AI tool that reads structured design tokens. The agent will reproduce Best Buy's specific moves: cobalt-blue nav band, blue-to-teal gradient promotional cards, condensed display at weight 300, and price-tag yellow scoped to in-banner chips only. The tokens resolve without invention — every hex, font name, radius, and spacing value is a quoted scalar you can paste into Tailwind config or CSS variables. The one move worth borrowing only if your brand has a physical-world referent (a tag, a sticker, a stamp) is the logomark-as-system primitive coherence. Most retail brands have abstract marks; Best Buy gets away with the tag because the yellow rectangle works as both logo and price label."

mockups:
  - "marketing-hero"
  - "media-grid"

colors:
  primary: "#0457c8"
  primary-deep: "#013196"
  primary-on-nav: "#0046be"
  promo-gradient-mid: "#2b4cb6"
  promo-gradient-teal: "#7fd8ff"
  promo-gradient-cyan: "#a6e4ff"
  ink: "#040c13"
  ink-default: "#030303"
  ink-soft: "#1d252c"
  ink-muted: "#3d3d3d"
  muted: "#70757d"
  canvas: "#ffffff"
  surface-1: "#f3f4f6"
  surface-2: "#e4e5e8"
  hairline: "#c4c8cf"
  hairline-soft: "#90959e"
  scarcity-yellow: "#fff200"

typography:
  display-xl:
    fontFamily: "\"Human BBY Digital Condensed\", \"Human BBY Digital\", sans-serif"
    fontSize: 80px
    fontWeight: 300
    lineHeight: 76px
    letterSpacing: 0
  display-md:
    fontFamily: "\"Human BBY Digital\", \"Human Fallback\", Arial, Helvetica, sans-serif"
    fontSize: 25px
    fontWeight: 300
    lineHeight: 30px
    letterSpacing: 0
  heading-lg:
    fontFamily: "\"Human BBY Digital\", \"Human Fallback\", Arial, Helvetica, sans-serif"
    fontSize: 20px
    fontWeight: 500
    lineHeight: 24px
    letterSpacing: 0
  heading-md:
    fontFamily: "\"Human BBY Digital\", \"Human Fallback\", Arial, Helvetica, sans-serif"
    fontSize: 17px
    fontWeight: 600
    lineHeight: 20.4px
    letterSpacing: 0
  heading-sm:
    fontFamily: "\"Human BBY Digital\", \"Human Fallback\", Arial, Helvetica, sans-serif"
    fontSize: 15px
    fontWeight: 600
    lineHeight: 30px
    letterSpacing: 0
  body-md:
    fontFamily: "\"Human BBY Digital\", \"Human Fallback\", Arial, Helvetica, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 18px
    letterSpacing: 0
  body-sm:
    fontFamily: "\"Human BBY Digital\", \"Human Fallback\", Arial, Helvetica, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 15.6px
    letterSpacing: 0
  body-xs:
    fontFamily: "\"Human BBY Digital\", \"Human Fallback\", Arial, Helvetica, sans-serif"
    fontSize: 11px
    fontWeight: 400
    lineHeight: 13.2px
    letterSpacing: 0
  label-md:
    fontFamily: "\"Human BBY Digital\", \"Human Fallback\", Arial, Helvetica, sans-serif"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0
  nav-link:
    fontFamily: "\"Human BBY Digital\", \"Human Fallback\", Arial, Helvetica, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 30px
    letterSpacing: 0
  button-md:
    fontFamily: "\"Human BBY Digital\", \"Human Fallback\", Arial, Helvetica, sans-serif"
    fontSize: 13px
    fontWeight: 600
    lineHeight: 15.6px
    letterSpacing: 0

rounded:
  none: "0px"
  sm: "4px"
  md: "8px"
  lg: "16px"
  full: "9999px"
  circle: "50%"

spacing:
  xs: "2px"
  sm: "4px"
  base: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "40px"

components:
  top-nav:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.canvas}"
    typography: "{typography.nav-link}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
    height: "80px"
  utility-nav:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.canvas}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.none}"
    padding: "4px 16px"
    height: "30px"
  nav-link:
    backgroundColor: transparent
    textColor: "{colors.canvas}"
    typography: "{typography.nav-link}"
    padding: "0px 8px"
  search-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "0px 12px"
    height: "44px"
    borderColor: "{colors.hairline-soft}"
  promo-card-gradient:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.scarcity-yellow}"
    typography: "{typography.display-xl}"
    rounded: "{rounded.md}"
    padding: "24px 24px 16px"
  promo-card-light:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-default}"
    typography: "{typography.heading-lg}"
    rounded: "{rounded.md}"
    padding: "24px"
    borderColor: "{colors.surface-2}"
  hero-heading:
    backgroundColor: transparent
    textColor: "{colors.scarcity-yellow}"
    typography: "{typography.display-xl}"
  section-heading:
    backgroundColor: transparent
    textColor: "{colors.ink-default}"
    typography: "{typography.heading-lg}"
  body-paragraph:
    backgroundColor: transparent
    textColor: "{colors.ink-default}"
    typography: "{typography.body-md}"
  body-paragraph-muted:
    backgroundColor: transparent
    textColor: "{colors.ink-muted}"
    typography: "{typography.body-sm}"
  button-primary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.full}"
    padding: "8px 24px"
    height: "36px"
    border: "0"
  button-secondary:
    backgroundColor: transparent
    textColor: "{colors.canvas}"
    typography: "{typography.button-md}"
    rounded: "{rounded.full}"
    padding: "8px 24px"
    height: "36px"
    borderColor: "{colors.canvas}"
  button-text-link:
    backgroundColor: transparent
    textColor: "{colors.primary}"
    typography: "{typography.body-md}"
    padding: "0px"
  date-tag:
    backgroundColor: "{colors.scarcity-yellow}"
    textColor: "{colors.ink-default}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
    height: "22px"
  category-puck:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink-default}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.circle}"
    padding: "0px"
    height: "80px"
  card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-default}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "16px"
    borderColor: "{colors.surface-2}"
  skeleton-block:
    backgroundColor: "{colors.surface-2}"
    textColor: transparent
    rounded: "{rounded.md}"
    padding: "0px"
  text-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "0px 12px"
    height: "32px"
    borderColor: "{colors.hairline-soft}"
---

## Overview

Best Buy's homepage runs the entire chrome on a single physical-world primitive. **Tag-as-system**: the brand mark is a yellow rectangular price tag, the top-nav is the same cobalt blue that fills the tag's background, the promotional banners stamp condensed yellow display on a blue-to-teal gradient, and the "Ends 5/25" date chip is a tag-shaped yellow pill — every yellow rectangle on the page reads as a price label. Where Amazon trusts a tiny smile-arrow and Walmart leans on a spark mark over pure white, Best Buy paints the chrome in retail-banner saturation and treats the logo geometry as a recurring component.

The brand voltage is cobalt blue (`{colors.primary}` — #0457c8). It fills the top-nav band, carries every link and price label as text (108 occurrences), and forms the left end-stop of every promotional gradient. Above the fold the page exposes two flat-band devices stacked vertically: a cobalt utility-nav strip at 30px tall ("Yardbird · Best Buy Outlet · Best Buy Business"), and the main 80px-tall cobalt nav holding the wordmark, hamburger menu, store-wide search, store locator, and cart. Below those two bands the cobalt steps aside for white surfaces, and the brand voltage becomes a link color rather than a fill.

**Condensed weight 300 as the shout**: the in-page promotional banner runs Human BBY Digital Condensed at 80px / weight 300 in highlighter yellow. Where most big-box retailers reach for weight 700+ condensed for sale headlines, Best Buy renders the loudest moment in the lightest condensed weight available. The result reads as confident retail muscle rather than panicked clearance. Body and chrome sit at 11-20px in Human BBY Digital at weights 400-600; there is no second display family below 80px.

**Key Characteristics:**
- Single brand voltage `{colors.primary}` (#0457c8) — 211 occurrences, fills the nav band and carries every link as text. Wired into 17 CSS custom-property aliases including `--colorRolePrimary600` and `--color-unstable-link-blue`.
- Highlighter-yellow scarcity voltage `{colors.scarcity-yellow}` (#fff200) — 5 occurrences total, all inside promotional banners as price-tag chips, condensed display fill, or the wordmark interior. Never used as hover state, focus ring, or structural badge.
- Blue-to-teal promotional gradient — left end-stop `{colors.primary}`, mid `{colors.promo-gradient-mid}` (#2b4cb6), right end-stop `{colors.promo-gradient-teal}` (#7fd8ff) and a cyan top-right corner `{colors.promo-gradient-cyan}` (#a6e4ff). Reserved for the in-page promo billboards.
- Condensed display in light weight — `{typography.display-xl}` is 80px / weight 300 in `{colors.scarcity-yellow}`, a deliberately understated condensed treatment.
- Skeleton-first hydration — grey placeholder blocks at `{colors.surface-2}` (#e4e5e8) render before product modules resolve and form a captured part of the marketing chrome.
- Tag-shaped date chip — `{component.date-tag}` is a `{rounded.sm}` 4px yellow rectangle with 2x8 padding, holding "Ends 5/25" text in ink. It is the smallest instance of the tag motif on the page.
- Circular category pucks — the "Shop deals by category" rail uses `{rounded.circle}` 50% surfaces holding product photography over a grey backplate; the rail is the only place circular geometry appears.
- 8px base spacing unit with major tokens at 16 / 24 / 32px; the system has no 6px or 10px intermediates.
- White-pill primary CTA on cobalt — the hero "Shop now" button inverts the standard pattern by using `{colors.canvas}` fill with `{colors.primary}` text inside `{rounded.full}` rounding.

## Colors

### Brand

- **Cobalt Primary** (`{colors.primary}` — #0457c8): frequency 211. Used as text (108), border (103), background fill on the top-nav and inside promotional gradient end-stops. Wired in CSS as `--colorRolePrimary600`, `--color-unstable-link-blue`, `--colorBgPrimary`, `--colorFgPrimary`, and 13 other aliases. The single brand voltage — the load-bearing color for every link, price label, and the cobalt nav band.
- **Cobalt Deep** (`{colors.primary-deep}` — #013196): frequency 1 (in-page as a gradient stop). Wired as `--color-bg-button-primary-dark`. Reserved for hover and pressed states on the primary surface.
- **Cobalt On-Nav** (`{colors.primary-on-nav}` — #0046be): frequency 8 — 5 as background, 1 as text, 1 as border, 1 inside a gradient. Wired as `--colorBgPrimaryHighlight`. Used as the subtle hover and selection fill on items sitting on the cobalt nav band.

### Promotional Gradient

- **Promo Mid** (`{colors.promo-gradient-mid}` — #2b4cb6): frequency 1. The middle stop of the blue-to-teal sale banner gradient — a slightly violet blue that bridges the cobalt left edge into the teal right edge.
- **Promo Teal** (`{colors.promo-gradient-teal}` — #7fd8ff): frequency 1. The right-end stop of the promotional gradient — a fresh aqua that reads as "summer tech" rather than as a secondary brand accent.
- **Promo Cyan** (`{colors.promo-gradient-cyan}` — #a6e4ff): frequency 1. The upper-right gradient corner — slightly lighter than the teal end-stop, only visible inside the largest promo card.

### Scarcity

- **Scarcity Yellow** (`{colors.scarcity-yellow}` — #fff200): frequency 5 — 2 as text, 1 as background, 2 as border. Used only inside promotional contexts: the 80px condensed display headline ("MEMORIAL DAY SALE"), the tag-shaped date chip, and the yellow interior of the wordmark itself. Wired as `--colorPaletteGold500` / `--colorRoleHighlight500`. The retail-banner voltage; never a structural color.

### Text

- **Ink** (`{colors.ink}` — #040c13): frequency 1339 — 677 as text, 662 as border. The dominant text color across body paragraphs, h3 product titles, and price labels. Wired as `--color-fg-base` and `--color-fg-dark`.
- **Ink Default** (`{colors.ink-default}` — #030303): frequency 74 — 37 as text, 37 as border. The h2 section-heading and primary-button-text color. Wired as `--colorFgDefault` and `--colorPaletteCharcoal900`.
- **Ink Soft** (`{colors.ink-soft}` — #1d252c): frequency 28 — used for secondary text and input borders. Wired as `--colorBrandTechBlack` — the proprietary "Tech Black" rather than pure black.
- **Ink Muted** (`{colors.ink-muted}` — #3d3d3d): frequency 30, all as background fill on dark-mode footer surfaces.
- **Muted** (`{colors.muted}` — #70757d): frequency 2 — secondary metadata text under product titles.

### Surface

- **Canvas** (`{colors.canvas}` — #ffffff): frequency 120 — 38 as background, 43 inside gradients (the white surface on which the cobalt nav and grey skeleton blocks sit). Wired into 50+ aliases as the default body floor.
- **Surface-1** (`{colors.surface-1}` — #f3f4f6): frequency 23, all as background. The neutral grey backplate behind category-puck photography and the "Build your home" content cards.
- **Surface-2** (`{colors.surface-2}` — #e4e5e8): frequency 145 — 43 as background, 13 as border, 86 inside gradients. The skeleton-placeholder color and the divider tone around product cards. Wired as `--colorBgSurfaceMuted`.

### Hairline

- **Hairline** (`{colors.hairline}` — #c4c8cf): frequency 6, all as border. The thin rule above the footer and around the search input.
- **Hairline Soft** (`{colors.hairline-soft}` — #90959e): frequency 1 as border. The form-field outline color used on the search input and footer email signup.

## Typography

### Font Families

The system runs two proprietary families: **Human BBY Digital** for all chrome surfaces (nav links, body paragraphs, headings, buttons, captions), and **Human BBY Digital Condensed** for the single promotional shout — the 80px / weight 300 sale banner headline. Fallback stack walks `"Human Fallback", Arial, Helvetica, sans-serif` for the body family and `"Human BBY Digital", sans-serif` for the condensed.

The pairing is unusual for the retail category. Most big-box retailers (Walmart, Target, Costco) ship a single sans for everything; Best Buy isolates the condensed display to the promotional moment and lets the regular family carry the dense product catalog underneath. The result is a typographic gear-shift between editorial sale banner and dense inventory grid.

### Hierarchy

| Token | Size | Weight | Line Height | Use |
|---|---|---|---|---|
| `{typography.display-xl}` | 80px | 300 | 76px | Promotional banner headline ("MEMORIAL DAY SALE") — condensed, yellow on gradient |
| `{typography.display-md}` | 25px | 300 | 30px | Secondary promo display, "$175" style price billboards |
| `{typography.heading-lg}` | 20px | 500 | 24px | h2 section heads ("Shop deals by category"), promo card headlines |
| `{typography.heading-md}` | 17px | 600 | 20.4px | h3 product titles inside cards |
| `{typography.heading-sm}` | 15px | 600 | 30px | Sub-section titles, deal-category headers |
| `{typography.body-md}` | 14px | 500 | 18px | Default body running text, product descriptions, button labels |
| `{typography.body-sm}` | 13px | 400 | 15.6px | Secondary body and inline links |
| `{typography.body-xs}` | 11px | 400 | 13.2px | Fine-print disclaimers ("Limited quantities. No rainchecks.") |
| `{typography.label-md}` | 12px | 500 | 16px | Tag labels, category chips, status badges |
| `{typography.nav-link}` | 13px | 400 | 30px | Top-nav link labels |
| `{typography.button-md}` | 13px | 600 | 15.6px | Primary and secondary button labels |

### Principles

Promotional display weight is 300. The 80px condensed headline at weight 300 is the editorial-confidence move — heavier condensed weights would read as panicked clearance. Body and chrome max out at weight 600 on h3 product titles; there is no 700+ tier on the captured page. Line-heights run tight (1.0-1.2x) on display and headings, looser (1.3-1.4x) on body — the chrome is dense by design, since the page sells inventory and every pixel that does not show a product photo is overhead.

### Note on Font Substitutes

Human BBY Digital and Human BBY Digital Condensed are proprietary brand families. The closest open-source substitute for the body family is **Inter** at the same weights — its slightly looser counters read close to Human BBY at 13-14px chrome sizes. For the condensed display, **Oswald** at weight 300 or **Barlow Condensed** at weight 300 transfer cleanly to the 80px promotional treatment; **Bebas Neue** is closer in feel but sits at a single weight only.

## Layout

### Spacing System

- **Base unit:** 8px — appears 84 times in the captured page, the dominant gap value.
- **Tokens:** `{spacing.xs}` 2px · `{spacing.sm}` 4px · `{spacing.base}` 8px · `{spacing.md}` 12px · `{spacing.lg}` 16px · `{spacing.xl}` 24px · `{spacing.2xl}` 32px · `{spacing.3xl}` 40px.
- **Top-nav padding:** 8x16 on the main cobalt band (80px tall); 4x16 on the utility strip above (30px tall).
- **Promo card padding:** `{spacing.xl}` (24px) horizontal with 16px bottom; the headline sits at the optical center, the CTA pill floats right.
- **Date-tag padding:** 2x8 — the tightest spacing token on the page, used to keep the yellow chip compact enough to read as a tag.

### Grid & Container

- **Page max-width:** ~1280px — the page is desktop-first, with promotional banners and product grids extending to the full container width.
- **Promo cards above the fold:** a 60/40 split — Memorial Day Sale on the left, a smaller Best Buy Plus subscription card on the right (~430px wide).
- **Category puck rail:** 7 visible circular pucks in a single horizontal row with a right-arrow scroller, each 80px circle on `{colors.surface-1}` backplate.
- **Product card grids below:** 3-up rows on desktop, each card on a white `{colors.canvas}` surface with a thin `{colors.surface-2}` border.
- **Skeleton placeholders:** render as horizontal grey blocks at the same width as the resolved cards — the layout is reserved before content arrives.

### Rhythm

The page is structured as **chrome → promo → category → inventory**, with the cobalt nav stack accounting for ~110px of vertical space before any product content. Below the nav, two promotional bands sit at ~250px and ~270px tall respectively, then a category-puck rail at ~140px, then a dense inventory grid of product cards. The promotional bands are the only place the brand voltage carries the surface; everywhere else cobalt is reserved for links and the navigation chrome.

## Elevation

The system has essentially **no shadow tier**. The captured page shows zero `shadow` occurrences for the brand color, and only sparing use of pure black at low opacity on the cobalt-nav drop. Cards lift from the canvas by `{colors.surface-2}` 1px borders rather than shadow halos; the promo banners sit flush against the white floor with no elevation effect.

- **Flat (no shadow):** every nav, promo card, category puck, product card, and footer band — 99% of surfaces.
- **Border-as-elevation:** `{colors.surface-2}` (#e4e5e8) carries the cell-divider role around product cards.
- **Nav drop:** the cobalt nav band sits flush at the page top with no shadow underneath — depth comes from the saturation contrast against the white body floor.

## Shapes

The radius scale is **small + pill + circle**.

- `{rounded.sm}` 4px — the dominant radius (45 occurrences). Search input, date-tag, secondary buttons.
- `{rounded.md}` 8px — promotional cards and product cards (4 occurrences).
- `{rounded.lg}` 16px — larger feature blocks (19 occurrences).
- `{rounded.full}` 9999px — primary action buttons ("Shop now", "Join now") render as full pills (15 occurrences).
- `{rounded.circle}` 50% — the category-puck rail uses fully circular surfaces (31 occurrences).

There is no 12px or 20px middle tier. The scale skips from 8px straight to 16px, and the pill / circle treatment is reserved for tappable actions and category navigation. The radius binary signals interactivity: anything circular or pill-shaped is clickable, anything else is content.

## Components

**`top-nav`** — The cobalt `{colors.primary}` band carrying the wordmark, hamburger menu, store-wide search, sign-in cluster, store locator, and cart. 80px tall, 8x16 padding, no border-radius. The single largest brand-voltage surface on the page.

**`utility-nav`** — A narrower cobalt strip sitting above the main nav, 30px tall with 4x16 padding. Holds the "Yardbird · Best Buy Outlet · Best Buy Business" sub-brand link cluster in white at `{typography.body-sm}`.

**`nav-link`** — Transparent fill, white text in `{typography.nav-link}` (13px / 400), 0x8 padding. The hamburger menu, store locator, cart label, and category links all use this baseline.

**`search-input`** — White `{colors.canvas}` fill with `{colors.hairline-soft}` 1px border, `{rounded.sm}` 4px radius, 0x12 padding, 44px tall. Sits in the center of the cobalt nav band, with a magnifying-glass icon button on the right edge.

**`promo-card-gradient`** — The signature in-page promo card. Blue-to-teal gradient fill (`{colors.primary}` → `{colors.promo-gradient-mid}` → `{colors.promo-gradient-teal}`), highlighter-yellow display text, `{rounded.md}` 8px radius, 24x24x16 padding. Holds the 80px condensed headline, a 1-line lead paragraph beneath, and a white-pill CTA centered on the right.

**`promo-card-light`** — The white companion card to the gradient promo. `{colors.canvas}` fill, `{colors.surface-2}` 1px border, `{rounded.md}` 8px radius, 24px padding. Holds the "my BEST BUY plus" subscription promo with a white-stroke "Join now" CTA.

**`hero-heading`** — The 80px condensed yellow display. Transparent background (sits on the promo card surface), `{colors.scarcity-yellow}` text, `{typography.display-xl}` (80px / weight 300 condensed). Width-capped at ~500px so the yellow runs at most across half the gradient.

**`section-heading`** — `{typography.heading-lg}` (20px / 500) in `{colors.ink-default}` (#030303). Used for "Shop deals by category" and other below-fold section heads.

**`body-paragraph`** — Default `{colors.ink-default}` running text at `{typography.body-md}`. The workhorse copy style.

**`body-paragraph-muted`** — `{colors.ink-muted}` variant at `{typography.body-sm}` for secondary captions.

**`button-primary`** — Inverted from convention: white `{colors.canvas}` fill, cobalt `{colors.primary}` text, full pill `{rounded.full}`, 8x24 padding, 36px height. "Shop now" on the gradient promo and "Join now" on the secondary promo. The white pill on cobalt is the most visually-dense element on the page.

**`button-secondary`** — Transparent fill with white text and a 1px white border. Same pill rounding and dimensions as the primary, used for nav-level secondary actions when on a cobalt surface.

**`button-text-link`** — Transparent background, `{colors.primary}` text at `{typography.body-md}` weight 500. The default in-body link style.

**`date-tag`** — The tag-shaped scarcity chip. `{colors.scarcity-yellow}` fill, `{colors.ink-default}` text at `{typography.body-md}`, `{rounded.sm}` 4px radius, 2x8 padding, 22px height. "Ends 5/25" is the canonical instance — the smallest tag-motif on the page.

**`category-puck`** — Fully circular `{colors.surface-1}` backplate, 80px wide, holding a product photo center-aligned. Sits in a horizontal scroll rail; the rail is the only place `{rounded.circle}` geometry appears.

**`card`** — White `{colors.canvas}` fill, `{colors.surface-2}` 1px border, `{rounded.md}` 8px radius, 16px padding. The default product-card surface, holding photo top, title middle, price bottom.

**`skeleton-block`** — `{colors.surface-2}` (#e4e5e8) fill rectangle at the layout-reserved width of the post-hydration component. No text, no border. Visible on every cold load; the system treats this as first-class chrome rather than a loading edge case.

**`text-input`** — White fill, ink text, 1px `{colors.hairline-soft}` border, `{rounded.sm}` 4px radius, 0x12 padding, 32px tall. Used for the footer email-signup form.

## Do's and Don'ts

**Do** treat the `{colors.scarcity-yellow}` (#fff200) as exclusively price-tag-coded. The yellow appears only inside promotional contexts — the wordmark interior, the condensed sale headline, the date-tag chip. Using it as a hover state or focus ring breaks the "yellow means price" reading the entire system depends on.

**Do** run the cobalt-to-teal gradient (`{colors.primary}` → `{colors.promo-gradient-teal}`) only on in-page promotional cards. The structural chrome stays on flat surfaces — cobalt nav, white body, grey skeleton blocks. Gradient on the nav band would dilute the promo-card signal.

**Do** keep `{typography.display-xl}` at weight 300. The 80px condensed at the lightest available weight reads as confident retail muscle. Bumping to weight 700 turns the editorial sale headline into a panicked clearance shout.

**Do** render the skeleton placeholders at `{colors.surface-2}` (#e4e5e8) at full component-width. The grey block reserves the layout so the page does not reflow when product modules hydrate; rendering skeletons at a smaller width creates a visual jump on data arrival.

**Don't** use `{colors.surface-2}` (#e4e5e8) as a hairline border or for body text. It is a background-and-skeleton token (43 of 145 occurrences as background, 86 as gradient stops); the closest border-only token is `{colors.hairline}` (#c4c8cf). Mixing them creates an inconsistent visual weight on card edges.

**Don't** introduce a 12px or 20px middle radius tier. The system is small (4-8-16px) plus pill plus circle. A 12px corner reads as borrowed from a SaaS dashboard rather than from Best Buy's retail chrome.

**Don't** render the primary CTA as a filled cobalt pill. The hero pattern inverts the convention — `{component.button-primary}` is white fill with cobalt text on a cobalt or gradient surface. Filling the CTA with the same cobalt as its surface kills the contrast.

**Don't** use Human BBY Digital Condensed for any non-promotional surface. The condensed family is reserved for the 80px sale banner moment; running it at smaller sizes (24-40px) for sub-section heads turns the chrome cluttered and loses the gear-shift between editorial sale and dense inventory grid.

## Known Gaps

- **Hover and focus states:** documented only for the primary CTA. Focus rings, active press tints, disabled fills, and validation glow are not exposed on the captured marketing surface.
- **Dark mode:** the captured page is light-only. A dark-mode token chain is declared in CSS (`--colorBgSurfaceInverse`, `--colorBrandTechBlack`) but does not render on the public homepage.
- **Form input error states:** the footer email-signup carries a resting state only. Error / validation styling lives inside the checkout flow and is not represented here.
- **Sub-brand chrome:** the utility nav names Yardbird, Best Buy Outlet, and Best Buy Business — each is a separate retail surface with its own token system that is not captured by this file.
- **Motion:** the category-puck rail scrolls horizontally with an arrow control, but the captured spec records the resting state only. Easing curves and snap behavior live in the live page runtime.
- **Hydration timing:** the skeleton-block tokens reflect the post-load steady state; the actual transition timing between skeleton and content is not part of this DESIGN.md.
- **Promotional gradient direction:** the captured gradient renders left-to-right; mobile and tablet breakpoints may flip to top-to-bottom but are not reflected in this spec.

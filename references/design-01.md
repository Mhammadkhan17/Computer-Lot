# Design-01: Best Buy Design System Implementation

**Branch:** `design-01` (from `main`)
**Status:** Planned
**Date:** July 2026

---

## Overview

Implement the Best Buy DESIGN.md spec (from `references/best-buy-design.md`) as the visual design system for Lot Liquidation. The redesign replaces the current dark/navy/orange theme with a **light-mode Best Buy aesthetic**: cobalt primary (`#0457c8`), white canvas body, blue-to-teal gradient promo banners, scarcity yellow (`#fff200`) for promotional moments only, Barlow Condensed for the 80px hero headline, and flat surfaces with border-only elevation.

**Key decisions:**
- Public pages: **light body** (Best Buy faithful)
- Dashboard: **dark mode preserved** (admin ergonomics)
- Utility nav: "About · FAQ · Contact" in 30px cobalt strip
- Hero headline: "Computer Lots" in Barlow Condensed 80px/300 scarcity-yellow on gradient
- No orange accent — cobalt is the sole brand voltage

---

## SECTION A: Design Tokens — `globals.css`

### A1. Color Token Map

| Tailwind Name | Hex | Best Buy Role | Our Usage |
|---|---|---|---|
| `--color-primary` | `#0457c8` | Cobalt primary voltage | Nav bg, link color, border, CTA text |
| `--color-primary-foreground` | `#ffffff` | White on cobalt | Text on nav, text on gradient |
| `--color-primary-deep` | `#013196` | Cobalt deep | Hover/pressed states on primary |
| `--color-primary-on-nav` | `#0046be` | Nav highlight | Hover fill on nav items |
| `--color-promo-mid` | `#2b4cb6` | Gradient mid-stop | Hero gradient only |
| `--color-promo-teal` | `#7fd8ff` | Gradient teal | Hero gradient only |
| `--color-promo-cyan` | `#a6e4ff` | Gradient cyan | Hero gradient accent |
| `--color-scarcity-yellow` | `#fff200` | Price-tag voltage | Hero headline, sale chips ONLY |
| `--color-ink` | `#040c13` | Dominant text | Body, h3 titles, price labels |
| `--color-ink-default` | `#030303` | h2 sections | Section headings, button text |
| `--color-ink-soft` | `#1d252c` | Secondary text | Input borders, secondary captions |
| `--color-ink-muted` | `#3d3d3d` | Muted text | Footer dark-mode text |
| `--color-muted` | `#70757d` | Metadata | Secondary metadata under titles |
| `--color-canvas` | `#ffffff` | Body floor | Page bg, card bg, promo light bg |
| `--color-surface-1` | `#f3f4f6` | Grey backplate | Section alternate bg, behind cards |
| `--color-surface-2` | `#e4e5e8` | Skeleton fill | Skeleton blocks ONLY |
| `--color-hairline` | `#c4c8cf` | Thin border | Card borders, section dividers |
| `--color-hairline-soft` | `#90959e` | Form outline | Search input, text inputs |
| `--color-background` | `#ffffff` | Body (remapped) | `bg-background` → canvas |
| `--color-foreground` | `#040c13` | Text (remapped) | `text-foreground` → ink |
| `--color-card` | `#ffffff` | Card surface | Card component bg |
| `--color-card-foreground` | `#040c13` | Card text | Card text |
| `--color-muted-foreground` | `#3d3d3d` | Muted text | `text-muted-foreground` |
| `--color-border` | `#c4c8cf` | Border | `border-border` → hairline |
| `--color-input` | `#90959e` | Input border | Input element border |
| `--color-ring` | `#0457c8` | Focus ring | Focus-visible ring (cobalt) |
| `--color-accent` | **REMOVED** | — | No more orange accent |

**Preserved for Dashboard (dark mode):**
| Token | Value |
|---|---|
| `--color-surface-dark` | `#0f1117` |
| `--color-surface-dark-border` | `#1f232e` |
| `--color-text-dark-muted` | `#9ca3af` |
| `--color-grade-a` | `#45845f` |
| `--color-grade-b` | `#b8862c` |
| `--color-grade-c` | `#c95d2b` |
| `--color-grade-parts` | `#6b4c8a` |

### A2. Typography

| Token | Font | Size | Weight | Line Ht | Use |
|---|---|---|---|---|---|
| `display-xl` | Barlow Condensed | 80px | 300 | 76px | Hero headline on gradient |
| `display-md` | Inter | 25px | 300 | 30px | Price billboards, stat numbers |
| `heading-lg` | Inter | 20px | 500 | 24px | h2 section heads |
| `heading-md` | Inter | 17px | 600 | 20.4px | h3 product titles |
| `heading-sm` | Inter | 15px | 600 | 30px | Sub-section headers |
| `body-md` | Inter | 14px | 500 | 18px | Default body text |
| `body-sm` | Inter | 13px | 400 | 15.6px | Secondary body |
| `body-xs` | Inter | 11px | 400 | 13.2px | Fine print |
| `label-md` | Inter | 12px | 500 | 16px | Badges, chips |
| `nav-link` | Inter | 13px | 400 | 30px | Nav links |
| `button-md` | Inter | 13px | 600 | 15.6px | Button labels |

### A3. Radius Scale

| Name | Value | Usage |
|---|---|---|
| `--radius-sm` | 4px | Search input, date-tag, text-input |
| `--radius-md` | 8px | Cards, promo cards |
| `--radius-lg` | 16px | Feature blocks |
| `--radius-full` | 9999px | Pill buttons |
| `--radius-circle` | 50% | (Skipped) |

**No 12px or 20px tier.** Scale: 4-8-16-pill-circle.

### A4. Spacing Tokens

```
xs: 2px | sm: 4px | base: 8px | md: 12px | lg: 16px | xl: 24px | 2xl: 32px | 3xl: 40px
```

No 6px or 10px intermediates. All measurements use this set.

### A5. Font Import

Add to existing Google Fonts import:
```
Barlow+Condensed:wght@300;400;500;600;700
```

---

## SECTION B: Component Map — All 18 Best Buy Components

| # | Best Buy Component | Our File | Mapping & Details |
|---|---|---|---|
| **1** | **top-nav** | `navbar.tsx` | 80px tall, `bg-primary` (#0457c8), 8x16 padding, no border-radius. Holds: wordmark, hamburger, search, sign-in cluster, cart. White text. |
| **2** | **utility-nav** | `navbar.tsx` (new top strip) | 30px tall, `bg-primary`, 4x16 padding, `text-sm text-white`. Links: "About · FAQ · Contact" in `body-sm` (13px/400). Separators via `text-white/50`. |
| **3** | **nav-link** | `navbar.tsx` | Transparent bg, `text-white`, `body-sm` (13px/400), 0x8 padding. Hover: `bg-primary-on-nav` (#0046be). |
| **4** | **search-input** | `navbar.tsx` + `search-bar.tsx` | White `bg-canvas` (#fff), `border-hairline-soft` (1px #90959e), `rounded-sm` (4px), 0x12 padding, 44px tall, magnifying-glass icon right. |
| **5** | **promo-card-gradient** | `hero.tsx` (full section) | Blue-to-teal gradient `bg-gradient-to-r from-[#0457c8] via-[#2b4cb6] to-[#7fd8ff]`. `rounded-md` (8px). 24x24x16 padding. 80px condensed yellow headline. 1-line lead paragraph. White-pill CTA. |
| **6** | **promo-card-light** | `hero.tsx` (secondary card) | White `bg-canvas`, 1px `border-hairline`, `rounded-md` (8px), 24px padding. Secondary CTA with white-stroke button. Sits next to gradient card in 60/40 split. Content: wholesale program sell. |
| **7** | **hero-heading** | `hero.tsx` | 80px Barlow Condensed weight 300, `text-scarcity-yellow`, width-capped ~500px. |
| **8** | **section-heading** | All section components | `heading-lg` (Inter 20px/500), `text-ink-default` (#030303). Used for "How It Works", "Features", "Available Lots". |
| **9** | **body-paragraph** | All components | `body-md` (Inter 14px/500), `text-ink` (#040c13). Default running text. |
| **10** | **body-paragraph-muted** | All components | `body-sm` (Inter 13px/400), `text-ink-muted` (#3d3d3d). Secondary captions. |
| **11** | **button-primary** | `button.tsx` (new variant) | White `bg-canvas`, `text-primary` (#0457c8), `rounded-full` (pill), 8x24 padding, 36px h. **NEVER filled cobalt pill.** |
| **12** | **button-secondary** | `button.tsx` (new variant) | Transparent bg, `text-white`, 1px `border-white`, `rounded-full`, 8x24 padding, 36px h. Used on cobalt/gradient surfaces. |
| **13** | **button-text-link** | `globals.css` (class) + `button.tsx` variant | Transparent bg, `text-primary` (#0457c8), `body-md` (14px/500) weight 500. Default `<a>` and `Link` styling. |
| **14** | **date-tag** | New utility class | Scarcity yellow `bg-scarcity-yellow`, `text-ink-default`, `rounded-sm` (4px), 2x8 padding, 22px h. Use for "Limited stock" or sale date indicators. |
| **15** | **category-puck** | **SKIP** | Not applicable — no circular category navigation. |
| **16** | **card** | `card.tsx` (shadcn) | White `bg-canvas`, 1px `border-hairline`, `rounded-md` (8px), 16px padding. **No shadow.** Remove `shadow` from Card base class. |
| **17** | **skeleton-block** | `skeleton.tsx` | `bg-surface-2` (#e4e5e8) fill. `rounded-md` (8px). Full component-width. No animation. |
| **18** | **text-input** | `input.tsx` (shadcn) | White bg, `text-ink`, 1px `border-hairline-soft`, `rounded-sm` (4px), 0x12 padding, 32px h. |

---

## SECTION C: Page-by-Page Implementation Order

### Phase 1 — Foundation (1 file)

**`globals.css`**: Complete theme rewrite per Section A.
- Rewrite `@theme` block with all Best Buy color tokens
- Remove `accent` and associated orange tokens
- Preserve dashboard dark tokens (`surface-dark`, `text-dark-muted`, grade colors)
- Add Barlow Condensed to Google Fonts import
- Set body to `bg-[#ffffff] text-[#040c13]`
- Set radius scale: sm=4px, md=8px, lg=16px
- Add Best Buy typography utility classes
- Add `button-text-link` base style for `<a>` and `Link` elements
- Add `prefers-reduced-motion` kill (preserve existing)

### Phase 2 — Chrome: Nav & Footer (2 files)

**`navbar.tsx`**: Full rebuild — components 1, 2, 3, 4.
- **Utility strip** (top 30px): `bg-primary`, 4x16 padding, white `body-sm` links with centered "About · FAQ · Contact". Separator dots between links.
- **Main nav** (80px): `bg-primary`, 8x16 padding. Layout: hamburger icon (left) → wordmark → search input (center, 44px, white fill, 4px radius) → sign-in/profile → cart icon.
- All text is `text-white` on cobalt. No `text-muted-foreground`.
- Hamburger: `text-white`, at least 44x44px touch target.
- Cart badge: white bg, `text-primary`, cobalt badge.
- Profile dropdown trigger: `text-white`, `hover:bg-primary-on-nav`.

**`site-footer.tsx`**: Light footer.
- `bg-surface-1` (#f3f4f6), `border-t border-hairline`, ink text.
- 4-column grid: brand description + quick links + grades + contact.
- Wordmark in `text-ink-default`.
- Links in `text-ink-muted` with `hover:text-primary`.
- Copyright line in `text-muted` with `border-t border-hairline` above.
- Remove all dark-surface references.

### Phase 3 — Hero & Sections (4 files)

**`hero.tsx`**: Components 5, 6, 7.
- **Two-card row**: 60/40 split at the top of the page (just below nav).
- **Left (gradient card):** Blue-to-teal gradient (`from-[#0457c8] via-[#2b4cb6] to-[#7fd8ff]`), `rounded-md`, 24x24x16 padding.
  - Headline: "COMPUTER LOTS" in Barlow Condensed 80px/300, `text-scarcity-yellow`, ~500px wide max.
  - Lead paragraph: Inter 14px/500 `text-white/90`.
  - Stats inline (total lots, products) — use `display-md` (Inter 25px/300) in white.
  - Grade badges as row of hairline-bordered pills with colored dots.
  - CTA: `button-primary` variant (white fill, cobalt text, pill).
- **Right (light card):** `bg-canvas`, 1px `border-hairline`, `rounded-md`, 24px padding.
  - Headline: Inter 20px/500 `text-ink-default` — "Wholesale Program" or similar.
  - Body: Inter 14px/500 `text-ink`.
  - CTA: `button-secondary` variant adapted for light card (cobalt border, cobalt text).
- Remove all accent-orange references. Remove dark background. Remove grid background pattern.

**`features.tsx`**: Components 8, 9, 10.
- `bg-surface-1`, `py-16 md:py-24`.
- Section head: Inter 20px/500, `text-ink-default`. Muted label above.
- Body text: Inter 14px/500, `text-ink`.
- Feature cards: `bg-canvas`, 1px `border-hairline`, `rounded-md`, 16px padding.
- Icon containers: cobalt tint (`bg-primary/10`, `text-primary`).
- Remove accent orange. Update hover state to `hover:border-primary/30`.

**`how-it-works.tsx`**: Components 8, 9, 10.
- `bg-canvas`, `py-16 md:py-24`.
- Section head + body text per typography tokens.
- Step cards: `bg-surface-1`, `border-hairline`, `rounded-md`, 16px padding.
- Step numbers: cobalt circle `bg-primary text-white`.
- Update all accent references to primary/cobalt.

**`wholesale.tsx`**: Components 8, 9, 10.
- `bg-surface-1`, `py-16 md:py-24`.
- Section head + body per tokens.
- Stat cards: `bg-canvas`, `border-hairline`, `rounded-md`, 16px padding.
- CTA buttons: primary and secondary variants.
- No accent orange. No dark background.

### Phase 4 — Primitives (7 files)

**`button.tsx`** (component 11, 12, 13):
- Add `bestbuy-primary` variant: `bg-canvas text-primary rounded-full px-6 py-2 h-9`
- Add `bestbuy-secondary` variant: `bg-transparent text-white border border-white rounded-full px-6 py-2 h-9`
- Add `bestbuy-link` variant: `text-primary underline-offset-4 hover:underline`
- Keep existing variants (default, destructive, outline, ghost, secondary) for dashboard use — update their colors to match new token system.

**`card.tsx`** (component 16):
- Change `rounded-xl` → `rounded-md`
- Change `shadow` → remove shadow
- Ensure 1px `border-border` (which maps to `hairline` #c4c8cf)

**`badge.tsx`**:
- Update default variant to cobalt bg with white text
- Grade badges (grade_a, grade_b, etc.) keep their semantic colors
- Remove accent-orange references

**`input.tsx`** (component 18):
- `rounded-sm` (4px), `border-hairline-soft`, white bg
- Height variants: 32px (default text-input), 44px (search-input)
- Update focus ring to `ring-primary`

**`skeleton.tsx`** (component 17):
- `bg-surface-2` (#e4e5e8)
- `rounded-md` (8px)
- No animation (or minimal pulse on surface-2)

**`dialog.tsx`**:
- Update border/radius to use new tokens
- Remove accent references

**`sheet.tsx`**:
- Update for new color tokens

### Phase 5 — Catalog & Products (4 files)

**`product-card.tsx`** (component 16):
- Card: `bg-canvas`, `border-hairline`, `rounded-md`, 16px padding, no shadow
- Image area: `bg-surface-1` placeholder (not `bg-muted` which maps differently now)
- Grade badge: small, left-top, uses grade colors
- Title: `heading-sm` (Inter 15px/600 `text-ink`)
- Description: `body-sm` (Inter 13px/400 `text-ink-muted`)
- Pricing: retail in `text-ink`, wholesale in `text-primary` (cobalt)
- Stock: green dot + `text-grade-a`
- "Add to Cart" button: uses `bestbuy-primary` variant adapted for white card (cobalt bg, white text?)
  - Actually, the button in the card is on white — so it should be `bg-primary text-primary-foreground` (cobalt fill, white text), which is the standard filled CTA. The inverted white-pill pattern is only on cobalt/gradient surfaces.
- Remove accent-orange from button.

**`catalog-grid.tsx`** (component 4):
- Search input: white `bg-canvas`, `border-hairline-soft`, `rounded-sm` (4px), 44px tall, `pl-12` for magnifying glass icon.
- Skeleton loading: `bg-surface-2` blocks at full card width.
- Pagination: update colors to cobalt.

**`product-detail-content.tsx`**:
- Update all `text-accent`, `bg-accent`, `border-accent` → cobalt equivalents
- Pricing card: `bg-canvas`, `border-hairline`, `rounded-md`, 16px padding
- Image gallery: update border colors to cobalt
- Tabs/buttons: use new button variants
- Sticky mobile CTA: update colors

**`products/[id]/page.tsx`**:
- Update metadata if needed

### Phase 6 — Funnels (3 files)

**`checkout-page.tsx`**:
- All accent → primary (cobalt)
- Card backgrounds → `bg-canvas`, `border-hairline`, `rounded-md`
- Button → `bestbuy-primary` variant
- Pricing breakdown in `text-ink`/`text-primary`

**`login/page.tsx`**:
- Rebrand with cobalt primary
- Branding area: cobalt gradient or solid cobalt banner with white text
- Form inputs: `rounded-sm`, `border-hairline-soft`
- Submit button: cobalt-filled pill (`bg-primary text-white rounded-full`)

**`receipt-content.tsx`**:
- Update tokens
- Card: `bg-canvas`, `border-hairline`, `rounded-md`
- WhatsApp button: new button variant
- Status badges: update colors

### Phase 7 — Utilities (2 files)

**`cart-drawer.tsx`**:
- Sheet with new color tokens
- Cart items: card styling per spec
- Quantity controls: cobalt accent
- Checkout CTA: new button variant
- Remove accent orange

**`search-bar.tsx`** (component 4):
- White `bg-canvas`
- `border-hairline-soft` (1px #90959e)
- `rounded-sm` (4px)
- 44px tall
- Magnifying glass icon in `text-hairline-soft`
- Focus ring: `ring-primary`

### Phase 8 — Dashboard (keeps dark mode)

Dashboard files preserve dark styling using `bg-surface-dark`, `border-surface-dark-border`, `text-text-dark-muted` tokens (kept in globals.css).

Changes needed:
- Update any accent-orange references to cobalt
- Update interactive buttons to use new button variants where appropriate
- Tables, stat cards, sidebar keep their dark aesthetic
- No major visual change — just token alignment

**Files:**
- `dashboard-content.tsx`
- `sidebar.tsx`
- `sections/overview.tsx`
- `sections/orders.tsx`
- `sections/products.tsx`
- `sections/approvals.tsx`
- `sections/add-product-modal.tsx`
- `sections/edit-product-modal.tsx`

### Phase 9 — Edge Cases (2 files)

**`not-found.tsx`**:
- Update colors: cobalt brand, light bg, ink text
- Remove dark accents

**`checkout-button.tsx`**:
- Use new button variant (`bestbuy-primary`)

---

## SECTION D: Implementation Rules (Do's and Don'ts)

**Hard rules that MUST be enforced:**

1. **Yellow is price-tag-only** — `scarcity-yellow` may NOT appear as hover, focus ring, badge color, button fill, or structural chrome. It only goes inside the hero promo and on `date-tag` chips.

2. **Gradient only on promo card** — The blue-to-teal gradient lives exclusively in the hero `promo-card-gradient`. No gradient on nav, cards, buttons, or anywhere else.

3. **Condensed only at 80px** — Barlow Condensed weight 300 is reserved for the hero headline. Never use it at 24-40px for sub-sections.

4. **No 12px or 20px radius** — Radius tier is strictly 4-8-16-pill-circle.

5. **Primary CTA is inverted on cobalt** — `button-primary` on cobalt/gradient surfaces is white fill + cobalt text. Never a filled cobalt pill on cobalt background (kills contrast). On white surfaces, use standard cobalt fill.

6. **`surface-2` is NOT a border token** — Use `hairline` (#c4c8cf) for card/dividers borders.

7. **Skeleton blocks at full width** — Must render at exact layout width of the resolved component.

8. **No shadows** — 99% of surfaces have zero shadow. Cards lift via 1px `hairline` borders.

9. **Dense typography** — Line heights: display/headings at 1.0-1.2x, body at 1.3x.

10. **Cobalt steps aside below the nav** — After the nav and hero, cobalt is reserved for links and price text only.

---

## SECTION E: Files Changed (Complete List)

```
Phase 1 — Foundation
  globals.css

Phase 2 — Chrome
  navbar.tsx
  site-footer.tsx

Phase 3 — Hero & Sections
  sections/hero.tsx
  sections/features.tsx
  sections/how-it-works.tsx
  sections/wholesale.tsx

Phase 4 — Primitives
  ui/button.tsx
  ui/card.tsx
  ui/badge.tsx
  ui/input.tsx
  ui/skeleton.tsx
  ui/dialog.tsx
  ui/sheet.tsx

Phase 5 — Catalog
  product-card.tsx
  catalog-grid.tsx
  products/[id]/product-detail-content.tsx
  products/[id]/page.tsx

Phase 6 — Funnels
  checkout/checkout-page.tsx
  login/page.tsx
  receipts/[id]/receipt-content.tsx

Phase 7 — Utilities
  cart-drawer.tsx
  search-bar.tsx

Phase 8 — Dashboard (dark)
  dashboard-content.tsx
  sidebar.tsx
  sections/overview.tsx
  sections/orders.tsx
  sections/products.tsx
  sections/approvals.tsx
  sections/add-product-modal.tsx
  sections/edit-product-modal.tsx

Phase 9 — Edge Cases
  not-found.tsx
  checkout-button.tsx
```

**Total: 38 files**

---

## SECTION F: Verification

After all phases:
```bash
npm run typecheck   # Zero errors
npm run lint         # Zero warnings
```

Visual review checklist:
- [ ] Cobalt nav (80px) + utility strip (30px) renders correctly
- [ ] Hero gradient with 80px yellow condensed headline
- [ ] White pill CTA on gradient (NOT cobalt pill)
- [ ] No orange anywhere on public pages
- [ ] Yellow only in hero/date-tag (never badges/hovers/focus)
- [ ] Cards have 8px radius, 1px hairline border, no shadow
- [ ] Skeleton blocks are surface-2 at full width
- [ ] Buttons: white pill on cobalt, border pill on gradient, cobalt text links
- [ ] Dashboard retains dark mode independently
- [ ] Responsive: nav stacks correctly on mobile
- [ ] Search input: 44px, white fill, 4px radius throughout

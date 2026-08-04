# Design QA — Inflamm’Menu

## Comparison target

- Source visual truth: `/Users/alexis/.codex/generated_images/019fcdcf-8d63-7d41-9791-fe4c52e90c5b/exec-f2d6333b-646f-4efc-a8ec-531f82404c7b.png`
- Browser-rendered implementation: `/Users/alexis/Documents/Codex/2026-08-04/referenced-chatgpt-conversation-this-is-an/outputs/inflamm-menu-prototype/qa/home-final.png`
- Full-view comparison evidence: `/Users/alexis/Documents/Codex/2026-08-04/referenced-chatgpt-conversation-this-is-an/outputs/inflamm-menu-prototype/qa/comparison-final.png`
- Focused-region comparison evidence: `/Users/alexis/Documents/Codex/2026-08-04/referenced-chatgpt-conversation-this-is-an/outputs/inflamm-menu-prototype/qa/comparison-details.png`
- State: iPhone, accueil par défaut, semaine du 3 au 9 août 2026, mardi 4 actif.

## Viewport and normalization

- Browser viewport: 1400 × 1200 CSS px.
- Mobile app screen: verified at 393 × 852 CSS px, device scale factor 1.
- Source image: 853 × 1844 px.
- Implementation screenshot: 393 × 852 px.
- Density normalization: source displayed at exactly 393 × 852 px in the comparison surface; implementation used its native 393 × 852 browser capture. The tiny source aspect-ratio delta was normalized only for the comparison surface.
- Expected runtime difference: the implementation keeps the template-owned iPhone bezel, live status bar, Dynamic Island and home indicator. These are not app-owned content and were not recreated inside the UI.

## Findings

No actionable P0, P1 or P2 mismatch remains.

- Fonts and typography: the Cormorant Garamond display face and DM Sans UI face preserve the source’s editorial serif/sans hierarchy, wrapping, weights and readable small text. The live iPhone status typography is runtime-owned.
- Spacing and layout rhythm: the hero, CTA, weekly preview and meal rows follow the source’s vertical order and proportions. The fixed navigation now reserves the iPhone safe area and no longer clips its labels.
- Colors and visual tokens: warm ivory, dark botanical green, muted olive, terracotta and turmeric accents map closely to the source and maintain readable contrast.
- Image quality and asset fidelity: all visible food assets are real generated raster images, sharp at rendered size, with matching natural daylight and editorial food styling. The hero crop now preserves negative space on the left and keeps the bowl on the right.
- Copy and content: the visible French copy, dates, meal names, portions and budget match the selected concept and the V1 brief.
- Icons: all controls use one consistent Radix icon family; no emoji, handcrafted SVG or CSS illustration substitutes are present.
- Accessibility and behavior: semantic buttons, headings, navigation, labels, checkboxes, reduced-motion handling and practical tap targets are present. The core paths are keyboard-addressable and readable at the mobile viewport.

## Focused region evidence

The focused comparison inspects the high-value regions at increased scale: wordmark, greeting, display headline, hero image crop, primary CTA, second meal row, profile action and bottom navigation. These details are readable in `qa/comparison-details.png`; no additional micro-crop was needed.

## Comparison history

### Pass 1 — blocked

- P2 hero composition: the first crop placed the bowl too centrally and reduced the source’s left-side negative space.
- P2 safe-area navigation: the root tab bar did not inherit the mobile scroll safe-area variable, causing its labels to sit too low.
- P2 brand detail: the small botanical wordmark companion was missing.

Fixes made:

- Anchored the generated hero image to the left edge so the food remains on the right.
- Switched the tab bar to the device-owned safe-area token, then tightened the weekly preview to prevent overlap.
- Added a real raster olive-sprig asset beside the wordmark.

### Pass 2 — passed

- Post-fix full-view evidence: `qa/comparison-final.png`.
- Post-fix focused evidence: `qa/comparison-details.png`.
- No remaining P0/P1/P2 differences were visible after normalization.

## Primary interactions tested

- Generate week: ready → loading → success → weekly menu.
- Profile: open, changeable controls, save and return.
- Weekly menu: day selection and recipe opening.
- Recipe: ingredients, preparation, favorite control and replacement entry.
- Replacement: filter, select an alternative, confirm, and update the recipe/menu state.
- Shopping list: group rendering and checkbox progress update.
- Favorites and history: tab switching and recipe access.
- Bottom navigation: Accueil, Semaine, Courses and Favoris.
- Browser console: checked in a fresh tab; no errors or warnings.

## Follow-up polish

- P3: the live iPhone chrome shifts the wordmark slightly lower than the chrome-free source, which is expected and should remain runtime-owned.
- P3: the generated food arrangement is not pixel-identical to the mock, but its subject, palette, crop, lighting and editorial role are equivalent.

final result: passed

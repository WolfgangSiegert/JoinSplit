# JoinSplit visual redesign — design QA

## Evidence

- Source visual truth: `/Users/Wolfgang/.codex/generated_images/01a0d8c3-53e2-77c0-b7a2-38a663a7dee1/exec-9f604894-a1b8-4908-98ac-add704159f53.png`
- Normalized source: `/Users/Wolfgang/developer/projects/JoinSplit/source/design-qa-source-normalized.png`
- Browser-rendered implementation: `/Users/Wolfgang/developer/projects/JoinSplit/source/design-qa-implementation.png`
- Side-by-side comparison: `/Users/Wolfgang/developer/projects/JoinSplit/source/design-qa-comparison.png`
- Viewport and CSS size: 390 × 844 px
- Source pixels: 853 × 1844, normalized to 390 × 844
- Implementation pixels: 390 × 844 at device pixel ratio 1
- State: active group, three participants, three expenses, synchronized, no open dialog

## Full-view comparison

The final side-by-side comparison shows the selected people-first hierarchy in both images: group context, section navigation, participant identities, total expenses, explicit participant balances, expense list, and a coral primary action. The implementation intentionally omits the mock's duplicate bottom navigation and category icons. The former is redundant with the existing approved navigation; the latter would require a new icon asset dependency or online icon loading, which conflicts with the project's no-new-dependency and local-first constraints.

## Focused-region comparison

No separate crop was required. At 390 × 844 the source and implementation text, balance rows, expense rows, navigation states, and primary action are readable in the full comparison. Form, error, archive, offline, and statement states are governed by the shared tokens but are not represented in the selected source mock, so exact visual fidelity for those states cannot be claimed from this comparison alone.

## Findings

- P3: The real implementation uses a larger accessible text scale than the generated mock, so the third expense sits partly behind the sticky primary action at the initial scroll position. It remains reachable by scrolling and is not clipped from the document.
- P3: Native system typography replaces the mock's approximate rounded grotesk. This avoids a network font dependency and keeps the local-first app shell reliable.
- Accepted intentional deviation: one section navigation is used instead of duplicating the same routes at the top and bottom.

## Required fidelity surfaces

- Fonts and typography: navy humanist system stack, strong tabular amount hierarchy, readable 15–16 px body text, and stable fallbacks. The mock font is approximated rather than downloaded.
- Spacing and layout rhythm: mobile-first 390 px layout, 44–48 px targets, continuous ledger rows, minimal nested surfaces, and a persistent primary action.
- Colors and visual tokens: warm sand base, navy ink, coral action, and blue/ochre/clay participant accents. Meaning is always repeated in text.
- Image and asset fidelity: no raster imagery or custom brand illustration exists in the selected mock. Initial avatars and functional balance bars are native UI data visualizations; no placeholder art is used.
- Copy and content: group name, participant names, amounts, dates, payer relationships, sync state, navigation labels, and action label match the grounded product state.

## Comparison history

1. Initial pass found a P1: the full sync message and oversized heading pushed the expense list below the first viewport. Fixed by moving the synchronized normal state into the top context row and reducing heading density; offline, pending, and error states remain detailed.
2. Second pass found a P1: participant identity and balance relationships were materially weaker than the selected direction. Fixed with a participant summary, repeated avatar identity, explicit “erhält/zahlt” labels, and proportional balance bars.
3. Final pass found no actionable P0, P1, or P2 mismatch. The remaining differences above are P3 or intentional product constraints.

## Browser and interaction checks

- Loaded the browser-rendered group screen at 390 × 844.
- Verified navigation to Salden, Personen, and back to Ausgaben.
- Verified the primary action opens the existing Ausgabe-erfassen route.
- Checked a fresh browser tab after hot reload: no console errors.
- Typecheck, 234 unit tests, and production build passed.
- The configured end-to-end suite could not start its external test servers in this environment; this is recorded as a verification gap, not a visual QA failure.

final result: passed

---

## Settlement direction carets — selected six-caret revision — 2026-09-25

### Evidence

- Source visual truth: `/Users/Wolfgang/.codex/generated_images/01a0d8c3-53e2-77c0-b7a2-38a663a7dee1/exec-f852528e-3212-4afa-a7fb-045e186f2d06.png`
- Browser-rendered implementation: `/Users/Wolfgang/developer/projects/JoinSplit/source/design-qa-implementation-caret-v6-unboxed.png`
- Generated PNG overview: `/Users/Wolfgang/developer/projects/JoinSplit/source/design-qa-settlement-overview-export-v6-unboxed.png`
- Source pixels: 965 × 1630.
- Implementation pixels and CSS viewport: 402 × 870 at device scale 1.
- State: active group, dark theme, Klartext design, three participants, two proposed settlement payments.

### Full-view comparison

The selected source, final browser screenshot, and generated PNG were inspected together. The implementation now reproduces the defining visual structure of the chosen direction: three filled carets before the amount, three after it, a muted coral-to-blue-to-mint progression, and the amount fixed at the visual center between payer and recipient.

The central amount is intentionally larger in type than the carets and vertically centered with them. Following the user's explicit correction, it is rendered directly on the row without the framed box shown in the exploratory source. It remains a readable anchor without interrupting the left-to-right payment direction.

### Focused-region comparison

The two payment rows were compared at 402 px and additionally measured at 389 px. Both participant names remain on one line, the longer `66,40 €` amount remains centered, and the carets retain visible spacing on both sides. The PNG export was inspected separately because it is a distinct shareable rendering surface.

### Findings and fixes

1. Initial six-caret implementation used scaled Lucide outlines. In the real 389 px viewport they remained too thin and visually weaker than the source. Classified P2.
2. Replaced only the financial-flow markers with compact filled caret shapes; ordinary application actions continue to use the existing Lucide icon system.
3. A later pass still used a framed amount field. The user rejected that interpretation; classified P2 and removed the border, background, radius, fixed height, and box padding.
4. Increased only the amount typography, centered it vertically with the carets, and added balanced inline breathing room.
5. A 402 px check found the first grid adjustment wrapped `Noor`; classified P2. Rebalanced the participant and direction tracks, then verified all four displayed participant names at 389 px remain exactly one text line high.
6. Reproduced the same unframed six-stage direction and enlarged central amount in the frozen PNG export.
7. Final comparison found no remaining actionable P0, P1, or P2 mismatch for the requested component.

### Accessibility and behavior

- The carets are decorative and do not carry meaning alone; the existing screen-reader sentence still announces step, payer, recipient, inactive status, and amount.
- All six carets point from payer to recipient, so direction remains understandable without color.
- The central amount uses tabular numerals and stays on one line.
- The below-360 px person-column reflow remains in place.
- No route, settlement calculation, persistence behavior, or CTA behavior changed.

### Verification

- Browser rendering checked at 402 × 870 and responsive text metrics checked at 389 × 870.
- Generated PNG inspected independently.
- Typecheck passed.
- 234 unit tests passed.
- Production build passed.

final result: passed

---

## Settlement direction carets — superseded four-caret iteration — 2026-09-25

### Evidence

- Source visual truth: `/Users/Wolfgang/.codex/generated_images/01a0d8c3-53e2-77c0-b7a2-38a663a7dee1/exec-f852528e-3212-4afa-a7fb-045e186f2d06.png`
- Browser-rendered implementation: `/Users/Wolfgang/developer/projects/JoinSplit/source/design-qa-implementation-caret.png`
- Source pixels: 965 × 1630.
- Implementation pixels and CSS viewport: 389 × 870 at browser screenshot density.
- State: active group, dark theme, Klartext design, three participants, two proposed settlement payments.
- Comparison method: the source and implementation were opened together in one visual comparison input. A browser-hosted contact sheet was not used because the browser correctly blocked the local data URL.

### Full-view comparison

The implementation preserves the selected concept's payer-to-recipient flow, amount as the central anchor, warm-to-cool-to-mint progression, participant identities, row order, and surrounding balance screen. The implementation intentionally reduces six heavy filled carets to four slimmer Lucide carets and removes the amount border, following the approved refinement brief rather than copying the exploratory image literally.

### Focused-region comparison

The two transfer rows remain readable at 389 px. Amounts stay on one line, names do not wrap, and the four carets use the available middle track without touching the people columns. The direction remains legible in grayscale because every caret points toward the recipient; color is secondary.

### Required fidelity surfaces

- Fonts and typography: existing JoinSplit display and UI typography is preserved. Amounts retain tabular numerals, strong weight, and stable one-line formatting.
- Spacing and layout rhythm: the middle track is balanced around the amount; payer and recipient columns receive equal minimum width. Below 360 px the people stacks reflow vertically rather than clipping.
- Colors and visual tokens: four semantic transfer tokens progress from muted coral through mauve and blue to mint. Dark-theme values remain restrained and sufficiently distinct from the page surface.
- Image quality and asset fidelity: the UI uses the existing Lucide icon library rather than raster placeholders or custom SVG art. The locally generated PNG snapshot reproduces the same four-step direction sequence using the Lucide chevron geometry.
- Copy and content: participant names, roles, amounts, payment count, explanatory notice, CTA, and strategy label are unchanged.

### Comparison history

1. Initial implementation at the narrow browser width made the carets too faint and allowed participant names to wrap. Classified P2.
2. Increased caret size and stroke modestly, rebalanced the three grid tracks, and added a below-360 px stacked person layout.
3. Post-fix comparison found no remaining actionable P0, P1, or P2 differences. The lower caret count and unframed amount are approved intentional refinements.

### Browser and interaction checks

- Inspected both settlement rows in the running application.
- Generated and inspected the frozen PNG overview with the new transfer visualization.
- Confirmed the existing accessible sentence still announces payer, recipient, step, and amount independently of the decorative carets.
- Typecheck passed.
- 234 unit tests passed.
- Production build passed.

### Follow-up polish

- P3: The four color steps could be tuned further after reviewing the light theme on a physical device, but this does not affect meaning or layout.

historical result before the selected six-caret revision: passed

---

## Appearance modes extension — 2026-09-25

### Source visual truth

- Design 2 remains the default design language and continues to use the source above.
- Design 3 source: `/Users/Wolfgang/.codex/generated_images/01a0d8c3-53e2-77c0-b7a2-38a663a7dee1/exec-20c7cac6-d722-401f-ac1f-b45f02b8a106.png`
- Scope added: independent device-local controls for `System / Hell / Dunkel` and `Entwurf 2 / Entwurf 3`.

### Visual and interaction checks

- Inspected the settings screen and the representative group-expenses screen in the running application.
- Checked Design 3 in light and dark color schemes at the existing mobile viewport.
- Checked Design 2 in dark mode and verified both selected states remain visible without relying on color alone.
- Verified the design switch changes typography, corner geometry, primary accent, participant shapes, navigation treatment, shadows, and ledger separators—not only color.
- Verified the dark theme covers shared surfaces, controls, muted text, status states, dialogs, and participant identities.
- Initial dark-mode inspection found insufficient inherited contrast on labels and participant names. Fixed by applying the semantic ink color at the body and form-label level, then re-inspected both settings and group screens.
- The options are native radio controls with text labels, visible focus treatment, and 48 px target height.
- Existing settings records without the two new fields are normalized to `System` and `Entwurf 2` when loaded; no IndexedDB schema change is required.

### Verification

- Typecheck passed.
- 234 unit tests passed.
- Production build passed.
- Browser interaction verified switching among Design 2, Design 3, light, and dark; preferences persisted through navigation.
- The full configured end-to-end suite was not rerun because its external test-server startup remains an environment limitation from the preceding redesign pass.

final result: passed

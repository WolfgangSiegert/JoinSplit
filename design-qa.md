# Design QA: Material and iOS skins

## Evidence

- Material source visual truth: `/var/folders/38/84xwncmx44z4kvm60cfgj0j00000gn/T/codex-clipboard-c7923df2-cd0e-4294-b3c9-39c4f8924cd6.png`
- Material implementation: `/tmp/joinsplit-material-final.png`
- iOS implementation: `/tmp/joinsplit-ios-final.png`
- Combined Material comparison: `/tmp/joinsplit-material-comparison.png`
- Viewport: 390 x 844 CSS pixels, mobile light-mode group overview.
- Source pixels: 778 x 1284. The source was proportionally normalized to 390 px width for comparison.
- Implementation pixels: 390 x 844 at browser screenshot density 1.
- Combined comparison pixels: 1608 x 1688 because the macOS image compositor used a 2x backing scale; both columns were laid out at the same 390 CSS-pixel width before encoding.
- Material source scope: visual primitives and surface treatment, not JoinSplit content or information architecture. The source's red app bar was intentionally replaced with the user-requested light-blue primary.
- iOS guidance: Apple Human Interface Guidelines for grouped lists, tab bars, toolbars, and materials. No pixel-exact iOS screenshot was supplied, so this part is principle-based rather than a literal clone.

## Full-view comparison

The combined comparison shows the requested Material characteristics in the JoinSplit screen: a solid blue app bar, high-contrast blue selected state, square white tiles, restrained elevation, flat rectangular controls, and a circular elevated create action. The implementation preserves JoinSplit's content and navigation while adopting the reference's visual hierarchy.

The iOS capture shows a separate system: grouped white list surfaces on a light grouped background, segmented selection, fine separators, system-blue accents, and a floating translucent tab bar. It no longer shares Klartext's angular cards or raised central create button.

## Focused-region comparison

The header, group-area switcher, expense list, and bottom navigation were inspected at readable scale because these carry the strongest skin identity. Settings controls were also checked in-browser: Material uses individual raised tiles; iOS uses a segmented color-mode control and grouped selection rows.

## Required fidelity surfaces

- Fonts and typography: Material uses the Roboto/Noto/Segoe UI/system stack and normal tracking; iOS uses the Apple system stack and tighter native-style tracking. Roboto is not bundled, so exact Material typography depends on local availability.
- Spacing and layout rhythm: Material uses square cards and explicit elevation; iOS uses inset grouped surfaces, rounded list containers, hairline separators, and a floating tab bar.
- Colors and visual tokens: Material uses `#2196f3` as the light primary with a darker blue interaction tone; iOS uses system blue on `#f2f2f7` and white grouped surfaces. Dark-mode token sets remain defined for both.
- Image quality and assets: No new raster assets were required. The supplied source is a UI-component reference rather than product imagery. Existing JoinSplit logo and icon components were preserved.
- Copy and content: JoinSplit labels and financial data remain unchanged; the skins do not alter product semantics.

## Comparison history

### Iteration 1

- P1: Material and iOS were mostly token swaps and looked too similar to Miteinander/Klartext.
- Fix: Rebuilt Material around blue app-bar, square tiles, classic elevation, underlined fields, flat tab tiles, and a FAB. Rebuilt iOS around segmented controls, grouped rows, inset lists, and a non-raised floating tab bar.
- Post-fix evidence: `/tmp/joinsplit-material-final.png` and `/tmp/joinsplit-ios-final.png`.

### Iteration 2

- P2: Material's active group tab was being overridden by utility classes, and the Beta chip had insufficient contrast in the blue header.
- Fix: Gave the active Material/iOS segmented states explicit precedence and added a dark translucent Beta-chip surface.
- Post-fix evidence: `/tmp/joinsplit-material-comparison.png`; computed Material active tab is `rgb(33, 150, 243)` with white text, and the Beta chip is white on `rgba(0, 0, 0, 0.16)` over the blue app bar.

## Browser verification

- Selected Material and iOS from Settings.
- Verified immediate visual application and persistence after reload.
- Verified the 390 px mobile breakpoint and no horizontal overflow in the affected Settings controls.
- Verified the group overview, segmented group navigation, expense list, and bottom navigation in both skins.
- Checked a fresh final browser tab for warnings and errors: none.

## Remaining P3 polish

- Bundle a licensed Material-compatible font only if exact Roboto typography becomes a product requirement; no dependency or remote font request was added in this pass.
- A future native-wrapper milestone could replace the shared web icon set with platform-specific Material Symbols and SF Symbols. The current web skin intentionally preserves the existing accessible icon components.
- The shared `New` action remains in the iOS tab bar for product consistency, even though current Apple guidance reserves tab bars primarily for navigation.

## Final result

final result: passed

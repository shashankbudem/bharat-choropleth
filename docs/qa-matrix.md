# Release QA matrix

Last verified against the Census-2011 bundle generated on 2026-08-13 (35 historical state/UT regions and 640 districts; the documented non-geographic source sentinel is excluded).

| Area | Check | Result | Evidence |
| --- | --- | --- | --- |
| Build | Renderer TypeScript and declaration build | Pass | `pnpm build` |
| Type safety | Renderer and demo type checks | Pass | `pnpm typecheck` |
| Unit/component | Keyboard, drill-down, focus restore, empty district state, national and historical-parent reference overlays | Pass | Vitest: 12 tests |
| Data values | Zero, negative, and `null` values remain distinct | Pass | Renderer component tests |
| Territorial semantics | Political-claim context, administrative control, and Census statistical coverage are separately labelled; context-only area has no metric interaction | Pass | Desktop/mobile browser QA of the generated **DataMeet** CC BY 4.0 overlay: visible hatch/key, `role=img` data-unavailable description, no tabindex/click/drill-down; the SoI source is cited only as comparison reference |
| J&K drill-down coverage | 22 Census-2011 districts render over the full J&K+Ladakh context outline; uncovered claimed territory remains hatched/no-data with no invented metric | Pass | Desktop/mobile browser QA: 22 interactive Census districts over a larger DataMeet J&K+Ladakh hatch; overlay has only data-unavailable text, `role=img`, and no tabindex/click/drill-down |
| Controlled API | Controlled selection/drill-down fires callbacks without overriding the host state | Pass | Renderer component tests |
| Resilience | District loader error and unavailable district data preserve a back path | Pass | Renderer component tests |
| Geometry API | Missing TopoJSON object throws a useful error | Pass | Renderer component tests |
| SSR | Server rendering does not touch browser globals | Pass | Renderer component test with `renderToString` |
| Data pipeline | Census hierarchy plus current DataMeet context overlay: decoded TopoJSON, IDs, checksums, bounds/area, and asset budgets | Pass | `pnpm check` regenerates and validates both source editions |
| Data footprint | Initial country asset | Pass | 35,121 B raw / 11,356 B gzip in validation report |
| Demo build | Production Vite bundle and lazy district chunks | Pass | `pnpm build:demo` |
| Desktop UX | Country hover/focus, visible context-only hatched area, click state, district drill-down, and return | Pass | Local demo: generated 11,773 B DataMeet outline is visibly hatched beyond the Census state layer; Maharashtra drills into 35 districts |
| Mobile UX | 390 × 844 layout: controls, map, legend, context overlay, and insight rail stack without horizontal page scroll | Pass | Local browser check: 327 px map / 175 px overlay; document scroll width 375 px within 390 px viewport |
| Attribution | Demo and README disclose separate historical Census-2011, DataMeet current-context, and SoI-reference roles | Pass | Root README, data attribution/source note, generated manifests, and demo footer |

## Remaining release risks

- Test in at least one screen reader/browser combination before publishing; current automated checks validate semantics and keyboard behavior, not spoken output.
- The simplified historical geometry is for display, not boundary-precision or area analysis.
- Publish the renderer and boundary data as separate versioned packages/artifacts, carrying the data manifest and attribution with every boundary distribution.

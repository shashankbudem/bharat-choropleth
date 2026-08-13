# README outline

The root README should stay short enough to be useful at install time and link to the detailed documents in this folder.

1. **Name and one-sentence purpose** — React choropleth components for India state-to-district exploration.
2. **Status and scope** — version status, supported geometry levels, the included historical Census-2011 data bundle, and what is not included (data collection, legal boundary authority, analytics backend).
3. **Install** — package-manager commands and peer dependency requirements.
4. **Quick start** — a small typed controlled example with country state values and a selection callback.
5. **Interaction model** — hover/focus, selection, drill-down, back, no-data behaviour.
6. **Data IDs** — deterministic Census-derived IDs for the bundled historical hierarchy; stable IDs (prefer LGD) for consumer geometry; never display-name joins; unmatched-data diagnostics.
7. **Bring your own data/geometry** — simple GeoJSON/TopoJSON example and lazy district import pattern.
8. **Accessibility** — keyboard operation, announced selection, visual focus, colour-independent cues, and consumer responsibility for custom tooltips/formatters.
9. **Data and attribution** — short code/data license distinction, DataMeet attribution for the included data, historical vintage/source disclaimer, and link to the full document.
10. **Packages** — renderer, data packages, and demo; state which ones include optional geometry.
11. **Development** — workspace setup and commands for build, type check, tests, lint, and demo.
12. **Contributing and security** — links to contribution policy, code of conduct, issue templates, security reporting, changelog, and license.

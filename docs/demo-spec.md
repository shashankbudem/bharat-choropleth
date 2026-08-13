# Demo application specification

The demo is a reference implementation, not a claim about real-world performance. It follows the approved Atlas layout: a clean country map, hover/focus details, an insight rail, click-to-drill district view, and a breadcrumb return.

## Required screens

- Country view with a labelled metric, a sequential legend, an initial selected state, and concise “hover/focus, then select” guidance.
- District view after selecting a state, with an obvious `India / State name` breadcrumb and a clear scope-specific total.
- Jammu & Kashmir district view with 22 Census-2011 districts over the retained J&K+Ladakh reference outline; claimed area outside the Census layer stays hatched/data unavailable and cannot be activated.
- No-data example showing both a no-data state and a state without district data.
- Mobile layout (320 px+) with map controls before the insight content, touch targets at least 44 by 44 CSS px, and no horizontal page scroll.
- Accessibility example demonstrating Tab, Enter/Space activation, focus restoration on back, and a readable non-tooltip summary.
- “Use your own geometry” link and compact DataMeet/source attribution linking to the full provenance notice.
- When the political-claim context overlay is enabled, a visible key labels it `Reference context · data unavailable`; it is never focusable/clickable and the demo links to its distinct DataMeet CC BY 4.0 provenance plus the cited SoI political-map reference.

## Content

- Use clearly labelled sample data; do not imply that values are official statistics.
- Name the country aggregate `Sample Census-coverage aggregate` (or name the exact contributing scope); never call it a national total while the non-metric context overlay is visible.
- Do not show, infer, or sum values for overlay-only territory. It signals claimed-territory context, not administrative control or Census statistical coverage.
- Show two named views: `State-level performance` and `District performance`.
- Include a `Metric` control only if it changes real demo data and explains its unit. Avoid controls that merely decorate the interface.
- Use a neutral, reversible palette for data that can be negative; use a sequential, perceptually ordered palette for non-negative counts.
- Surface the selected state/district name, formatted value, share of current scope, and data-status (`Reported`, `No data`, or `Zero`) in the insight rail.

## Demo verification

Automated or scripted QA must exercise mouse hover, keyboard focus/selection, district drill-down, the Jammu & Kashmir coverage gap treatment, back/focus restoration, a no-data state, and the 320 px layout. The published demo must have no uncaught console errors.

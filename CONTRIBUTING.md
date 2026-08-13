# Contributing

Thanks for improving Bharat Choropleth. Please open an issue before substantial API or data changes so maintainers can assess compatibility, licensing, and boundary provenance.

## Before opening a pull request

- Keep renderer changes independent from boundary-data changes where practical.
- Add tests for new interaction, data-joining, formatting, or accessibility behaviour.
- Run the workspace build, type check, lint, and test commands.
- Update the README and relevant docs when public behaviour changes.
- Do not contribute boundary files without a source URL, license, vintage, attribution text, transformation record, and checksum.

## Boundary-data contributions

Geography is not neutral or timeless. State the source and administrative vintage, use stable identifiers, and explain aliases or unit changes. Do not add a dataset whose redistribution terms are unknown. Issues about names, coverage, or boundary representation should cite an authoritative source where possible and be handled respectfully.

## Commit and review expectations

Keep pull requests focused. Reviewers will check API compatibility, keyboard and screen-reader impact, render/bundle impact, and required data attribution. Never include credentials, private datasets, or personal information in a contribution.

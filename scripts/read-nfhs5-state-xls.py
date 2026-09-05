#!/usr/bin/env python3
"""Reads the NFHS-5 state/UT factsheet workbook and prints its metrics as JSON.

The published file is legacy BIFF (.xls), which Node has no reader for, so this
sits beside build-observatory-data.mjs and is called by it. Column positions are
verified against the header text on every run rather than hard-coded blindly, so
a reshuffled workbook fails loudly instead of silently reading the wrong column.

Requires `xlrd` (pip install xlrd).
"""
import json
import sys

import xlrd

# Metric -> a distinctive fragment of the published column heading.
COLUMNS = {
    "improved_sanitation": "improved sanitation facility",
    "full_vaccination": "fully vaccinated based on information from either vaccination card or mother",
    "stunting": "stunted (height-for-age)",
    # Must name the age band: pregnant women use the same <11.0 g/dl threshold.
    "child_anaemia": "Children age 6-59 months who are anaemic",
}


def main(path: str) -> None:
    sheet = xlrd.open_workbook(path).sheet_by_index(0)
    header = [str(sheet.cell_value(0, c)).strip() for c in range(sheet.ncols)]

    index = {}
    for metric, needle in COLUMNS.items():
        hits = [i for i, text in enumerate(header) if needle.lower() in text.lower()]
        if len(hits) != 1:
            raise SystemExit(f"{metric}: expected one column matching {needle!r}, found {len(hits)}")
        index[metric] = hits[0]
    area = header.index("Area")

    rows = []
    for r in range(1, sheet.nrows):
        name = str(sheet.cell_value(r, 0)).strip()
        if not name or str(sheet.cell_value(r, area)).strip() != "Total":
            continue
        record = {"name": name}
        for metric, column in index.items():
            value = sheet.cell_value(r, column)
            if not isinstance(value, (int, float)) or value == "":
                raise SystemExit(f"{name}: {metric} is not numeric ({value!r})")
            # The source stores small-sample percentages as negatives so that
            # spreadsheet formatting shows them in parentheses; the magnitude is
            # the reported figure. Recorded in work/nfhs5/raw-source-notes.md.
            record[metric] = round(abs(float(value)), 2)
        rows.append(record)

    json.dump(rows, sys.stdout)


if __name__ == "__main__":
    main(sys.argv[1])

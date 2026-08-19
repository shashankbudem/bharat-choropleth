"""Generate an SVG from the repository's current state/UT boundary bundle.

Run from the repository root after installing this package in editable mode:
``python packages/python/examples/render_current_states.py``.
"""

from pathlib import Path

from bharat_choropleth import render_svg


ROOT = Path(__file__).resolve().parents[3]
TOPOLOGY = ROOT / "data/generated/current-2019-states/states.topo.json"

svg = render_svg(
    TOPOLOGY,
    {
        "in-cs-30-goa": 6,
        "in-cs-24-gujarat": 7,
        "in-cs-27-maharashtra": 41,
        "in-cs-31-lakshadweep": 43,
    },
    object_name="states",
    title="Illustrative state values",
    description="An example static Bharat choropleth. Unlisted regions have no data.",
)
(ROOT / "states-example.svg").write_text(svg, encoding="utf-8")

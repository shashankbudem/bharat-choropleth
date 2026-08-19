# `bharat-choropleth`

`bharat-choropleth` creates dependency-free, accessible static SVG
choropleths from TopoJSON. It is a Python sibling to the repository’s React,
plain-JavaScript, and Flutter renderers, intended for reports, generated web
pages, and notebooks that should not need a browser or JavaScript runtime.

It includes no boundaries. Pass a mapping or path to your own TopoJSON and
retain the source attribution and licence for any boundary bundle you use.
The repository’s prepared bundles are under [`data/generated`](../../data/generated)
and their notices are documented in [`data/ATTRIBUTION.md`](../../data/ATTRIBUTION.md).

## Install

```bash
pip install bharat-choropleth

# Only when you need a Matplotlib axes rather than SVG:
pip install 'bharat-choropleth[matplotlib]'

# Only when you need interactive state-to-district controls in Jupyter:
pip install 'bharat-choropleth[notebook]'
```

## Generate an SVG

```python
from bharat_choropleth import render_svg

values = {
    "in-cs-30-goa": 6,
    "in-cs-24-gujarat": 7,
    "in-cs-27-maharashtra": 41,
}

svg = render_svg(
    "data/generated/current-2019-states/states.topo.json",
    values,
    object_name="states",
    title="Example state metric",
    description="A static map. Regions without a supplied value are marked as no data.",
)
open("states.svg", "w", encoding="utf-8").write(svg)
```

`render_svg` returns a complete `<svg>` element with a title, optional
description, per-region accessible labels, an even-odd fill rule, and a
lower-to-higher legend. Features with missing, invalid, or non-finite values
receive the distinct no-data colour; they are never treated as low values.

## Decode once, render repeatedly

```python
from bharat_choropleth import decode_topology, render_svg

states = decode_topology("states.topo.json", object_name="states")
svg = render_svg(states, {"in-cs-30-goa": 6})
```

The decoder understands TopoJSON’s quantized delta arcs, reversed arc indexes,
holes, polygons, and multi-polygons. Every part is retained—an archipelago is
rendered as separate islands, never as a fabricated enclosing polygon.

## Optional Matplotlib

```python
from bharat_choropleth.matplotlib import render_matplotlib

ax = render_matplotlib("states.topo.json", values, object_name="states")
ax.figure.savefig("states.png", dpi=180, bbox_inches="tight")
```

The Matplotlib adapter is an extra, so importing `bharat_choropleth` does not
pull in Matplotlib or any other rendering dependency.

## Jupyter drill-down

Install the `notebook` extra for an `ipywidgets` state selector and lazy
district loader. The control updates its inline SVG when a state is selected;
it has no browser-map or JavaScript runtime dependency.

```python
from pathlib import Path
from bharat_choropleth.notebook import notebook_drilldown

root = Path.cwd()
states = root / "data/generated/current-2019-states/states.topo.json"
district_dir = root / "data/generated/current-2019-districts/districts"

map_control = notebook_drilldown(
    states,
    {"in-cs-30-goa": 6, "in-cs-31-lakshadweep": 43},
    district_loader=lambda state_id: district_dir / f"{state_id}.topo.json",
    states_object_name="states",
)
map_control.widget  # Display this as the last Jupyter cell expression.
```

Pass `district_values` as either a `{state_id: {district_id: value}}` mapping
or a `state_id -> {district_id: value}` callable to colour the district view.

## API

| Item | Purpose |
| --- | --- |
| `load_topology(source)` | Load a TopoJSON mapping or JSON file path. |
| `decode_topology(source, object_name=...)` | Decode `Polygon`/`MultiPolygon` areas into immutable `Feature` objects. |
| `ColorScale.fit(values)` | Fit the shared low-to-high colour ramp to finite values. |
| `render_svg(source, values, ...)` | Create a complete static, accessible SVG string. |
| `bharat_choropleth.matplotlib.render_matplotlib(...)` | Optional static Matplotlib renderer. |
| `bharat_choropleth.notebook.notebook_drilldown(...)` | Optional ipywidgets state-to-district SVG control. |

## Develop and package

```bash
python -m unittest discover -s tests -v
python -m build
twine check dist/*
```

Publishing to PyPI is intentionally a separate, identity-bound action:

```bash
python -m twine upload --repository testpypi dist/*  # optional first check
python -m twine upload dist/*
```

Never commit a PyPI token or generated third-party boundary data without first
checking its redistribution conditions.

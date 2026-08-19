"""Static, accessible choropleths for India TopoJSON boundary data.

The package deliberately has no mandatory rendering dependency.  Use
:func:`render_svg` to create a self-contained SVG for a web page, report, or
file.  Install ``bharat-choropleth[matplotlib]`` only when a Matplotlib axes is
needed.
"""

from .scale import DEFAULT_COLORS, EMPTY_COLOR, ColorScale
from .svg import render_svg
from .topojson import Feature, TopoJSONError, decode_topology, load_topology

__all__ = [
    "DEFAULT_COLORS",
    "EMPTY_COLOR",
    "ColorScale",
    "Feature",
    "TopoJSONError",
    "decode_topology",
    "load_topology",
    "render_svg",
]

__version__ = "0.1.0"

"""Static, accessible choropleths for India TopoJSON boundary data.

The package deliberately has no mandatory rendering dependency.  Use
:func:`render_svg` to create a self-contained SVG for a web page, report, or
file.  Install ``bharat-choropleth[matplotlib]`` only when a Matplotlib axes is
needed. Install ``bharat-choropleth[notebook]`` for an ipywidgets-based
state-to-district-to-sub-district notebook control.
"""

from .scale import DEFAULT_COLORS, EMPTY_COLOR, ColorScale
from .states import STATES, StateIdentity, normalize_state_key, resolve_state
from .svg import canonical_values, render_svg, value_for
from .topojson import Feature, TopoJSONError, decode_topology, load_topology

__all__ = [
    "DEFAULT_COLORS",
    "EMPTY_COLOR",
    "ColorScale",
    "Feature",
    "canonical_values",
    "STATES",
    "StateIdentity",
    "TopoJSONError",
    "decode_topology",
    "load_topology",
    "normalize_state_key",
    "render_svg",
    "resolve_state",
    "value_for",
]

__version__ = "0.3.0"

"""Optional Matplotlib adapter.

Importing :mod:`bharat_choropleth` never imports Matplotlib.  This module only
does so when a caller explicitly asks for a plot.
"""

from __future__ import annotations

from typing import Mapping, Optional, Sequence, Union

from .scale import ColorScale
from .svg import _coerce_features
from .topojson import Feature, TopologyInput


def render_matplotlib(
    source: Union[TopologyInput, Sequence[Feature]],
    values: Mapping[str, object],
    *,
    object_name: Optional[str] = None,
    ax: object = None,
    colors: Sequence[str] = ColorScale().colors,
    empty_color: str = ColorScale().empty,
    edgecolor: str = "#ffffff",
    linewidth: float = 0.6,
) -> object:
    """Draw a static choropleth on a Matplotlib axes and return that axes.

    Install the extra first: ``pip install bharat-choropleth[matplotlib]``.
    Each island ring is added independently, so disjoint territories remain
    disjoint rather than becoming an artificial bounding polygon.
    """

    try:
        from matplotlib import pyplot as plt
        from matplotlib.patches import Polygon
    except ImportError as error:
        raise ImportError(
            "Matplotlib rendering is optional; install it with "
            "pip install 'bharat-choropleth[matplotlib]'"
        ) from error

    features = _coerce_features(source, object_name)
    scale = ColorScale.fit((values.get(feature.id) for feature in features), colors=colors, empty=empty_color)
    axes = ax if ax is not None else plt.subplots()[1]
    all_points = []
    for feature in features:
        fill = scale.color_for_value(values.get(feature.id))
        for ring in feature.rings:
            if len(ring) < 3:
                continue
            all_points.extend(ring)
            axes.add_patch(Polygon(ring, closed=True, facecolor=fill, edgecolor=edgecolor, linewidth=linewidth))
    if all_points:
        xs, ys = zip(*all_points)
        pad_x = max((max(xs) - min(xs)) * 0.03, 0.01)
        pad_y = max((max(ys) - min(ys)) * 0.03, 0.01)
        axes.set_xlim(min(xs) - pad_x, max(xs) + pad_x)
        axes.set_ylim(min(ys) - pad_y, max(ys) + pad_y)
    axes.set_aspect("equal", adjustable="box")
    axes.set_axis_off()
    return axes

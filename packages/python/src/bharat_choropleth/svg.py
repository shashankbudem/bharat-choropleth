"""Accessible SVG rendering with no browser or graphics dependency."""

from __future__ import annotations

from html import escape
from itertools import count
from math import cos, radians
from typing import Callable, Dict, Mapping, Optional, Sequence, Tuple, Union

from .scale import ColorScale, FittedColorScale, numeric_value
from .states import normalize_state_key, resolve_state
from .topojson import Feature, TopologyInput, decode_topology

FeatureInput = Sequence[Feature]
ValueMapping = Mapping[str, object]


def canonical_values(values: ValueMapping) -> Dict[str, object]:
    """Re-key a values mapping so any spelling of a state finds its entry.

    Built once per layer rather than per feature: resolving is cheap, but a
    national map is 36 features and a district one can be 80, and rebuilding
    this for each would make the lookup quadratic.

    Only state names collapse - there is no district registry - so a key that is
    not a known state keeps its normalized form, which still buys
    case-insensitivity and separator-insensitivity at every level.  The first
    spelling of a region wins, so a caller who writes two keys for one region
    gets a deterministic answer rather than a dict-ordering accident.
    """
    canonical: Dict[str, object] = {}
    for key, value in values.items():
        resolved = resolve_state(key)
        canonical.setdefault(resolved.id if resolved else normalize_state_key(key), value)
    return canonical


def value_for(
    values: ValueMapping,
    feature: "Feature",
    canonical: Optional[Mapping[str, object]] = None,
) -> object:
    """Find a feature's value, trying the most literal match first.

    Exact id, then exact display name, then both sides resolved through the
    state registry.  The exact steps come first so nothing that already worked
    can change meaning: a layer keyed by the ids in its own bundle - which is
    what a drill-down loader normally hands back - never reaches the registry at
    all.

    The registry step is what lets ``"goa"``, ``"tamilnadu"``, ``"Orissa"`` and
    ``"jammu-and-kashmir"`` work, matching the React, JavaScript and Flutter
    packages.  Below the state level there is no registry, so those keys fall
    back to the normalized form, which still buys case- and
    separator-insensitive matching.

    ``in`` rather than ``.get(...) or``, so an explicit ``None`` reads as "no
    data" instead of falling through to the next candidate.  Pass ``canonical``
    from :func:`canonical_values` when looking up many features against one
    mapping; it is rebuilt here otherwise.
    """
    if feature.id in values:
        return values[feature.id]
    if feature.name in values:
        return values[feature.name]
    index = canonical_values(values) if canonical is None else canonical
    resolved_id = resolve_state(feature.id)
    resolved_name = resolve_state(feature.name)
    for candidate in (
        resolved_id.id if resolved_id else None,
        resolved_name.id if resolved_name else None,
        normalize_state_key(feature.id),
        normalize_state_key(feature.name),
    ):
        if candidate is not None and candidate in index:
            return index[candidate]
    return None


def render_svg(
    source: Union[TopologyInput, FeatureInput],
    values: ValueMapping,
    *,
    object_name: Optional[str] = None,
    width: int = 960,
    height: int = 640,
    padding: int = 24,
    title: str = "India choropleth",
    description: Optional[str] = None,
    colors: Sequence[str] = ColorScale().colors,
    empty_color: str = ColorScale().empty,
    stroke: str = "#ffffff",
    stroke_width: float = 0.8,
    show_legend: bool = True,
    format_value: Optional[Callable[[float], str]] = None,
) -> str:
    """Render TopoJSON or decoded features to a self-contained SVG string.

    Values are keyed by stable feature id.  ``None``, NaN, infinity, and absent
    values are visually and accessibly reported as ``No data`` rather than as
    the lowest value.  The output keeps every ring of a ``MultiPolygon`` in one
    even-odd SVG path, which correctly preserves archipelagos and holes.
    """

    if width <= 0 or height <= 0:
        raise ValueError("width and height must be positive")
    if padding < 0 or padding * 2 >= min(width, height):
        raise ValueError("padding must leave room for the map")
    features = _coerce_features(source, object_name)
    canonical = canonical_values(values)
    scale = ColorScale.fit((value_for(values, feature, canonical) for feature in features), colors=colors, empty=empty_color)
    projector = _fit_projector(features, width, height, padding)
    value_formatter = format_value or _default_format
    serial = count(1)
    title_id = "bharat-map-title"
    description_id = "bharat-map-description"
    aria_references = title_id + (" " + description_id if description else "")

    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {0} {1}" width="{0}" height="{1}" role="img" aria-labelledby="{2}" focusable="false">'.format(
            width, height, aria_references
        ),
        '<title id="{}">{}</title>'.format(title_id, escape(title)),
    ]
    if description:
        parts.append('<desc id="{}">{}</desc>'.format(description_id, escape(description)))
    parts.append('<g fill-rule="evenodd" stroke="{}" stroke-width="{}" stroke-linejoin="round">'.format(escape(stroke), stroke_width))
    for feature in features:
        raw_value = value_for(values, feature, canonical)
        numeric = numeric_value(raw_value)
        value_text = value_formatter(numeric) if numeric is not None else "No data"
        label = "{}, {}".format(feature.name, value_text)
        path = _path_for_feature(feature, projector)
        feature_id = "region-{}".format(next(serial))
        parts.append(
            '<path id="{id}" data-region-id="{data_id}" d="{path}" fill="{fill}" aria-label="{label}"><title>{label}</title></path>'.format(
                id=feature_id,
                data_id=escape(feature.id, quote=True),
                path=path,
                fill=escape(scale.color_for_value(raw_value), quote=True),
                label=escape(label),
            )
        )
    parts.append("</g>")
    if show_legend:
        parts.append(_legend(scale, width, height, padding, value_formatter))
    parts.append("</svg>")
    return "".join(parts)


def _coerce_features(source: Union[TopologyInput, FeatureInput], object_name: Optional[str]) -> Tuple[Feature, ...]:
    if isinstance(source, Sequence) and not isinstance(source, (str, bytes)) and all(isinstance(item, Feature) for item in source):
        return tuple(source)
    return decode_topology(source, object_name=object_name)  # type: ignore[arg-type]


def _fit_projector(features: Sequence[Feature], width: int, height: int, padding: int) -> Callable[[float, float], Tuple[float, float]]:
    points = [point for feature in features for ring in feature.rings for point in ring]
    if not points:
        return lambda _x, _y: (width / 2.0, height / 2.0)
    center_latitude = sum(point[1] for point in points) / len(points)
    longitude_scale = cos(radians(center_latitude))
    xs = [point[0] * longitude_scale for point in points]
    ys = [point[1] for point in points]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    span_x = max(max_x - min_x, 1e-9)
    span_y = max(max_y - min_y, 1e-9)
    scale = min((width - 2 * padding) / span_x, (height - 2 * padding) / span_y)
    offset_x = (width - scale * span_x) / 2.0 - min_x * scale
    offset_y = (height - scale * span_y) / 2.0 + max_y * scale

    def project(longitude: float, latitude: float) -> Tuple[float, float]:
        return longitude * longitude_scale * scale + offset_x, offset_y - latitude * scale

    return project


def _path_for_feature(feature: Feature, project: Callable[[float, float], Tuple[float, float]]) -> str:
    commands = []
    for ring in feature.rings:
        if not ring:
            continue
        first_x, first_y = project(*ring[0])
        command = ["M {} {}".format(_coordinate(first_x), _coordinate(first_y))]
        for point in ring[1:]:
            x, y = project(*point)
            command.append("L {} {}".format(_coordinate(x), _coordinate(y)))
        command.append("Z")
        commands.append(" ".join(command))
    return " ".join(commands)


def _legend(scale: FittedColorScale, width: int, height: int, padding: int, formatter: Callable[[float], str]) -> str:
    swatch_width = 24
    swatch_height = 12
    gap = 3
    legend_width = len(scale.colors) * (swatch_width + gap) - gap
    x = width - padding - legend_width
    y = height - padding - swatch_height
    text_y = y + 10
    chunks = [
        '<g id="bharat-map-legend" aria-label="Choropleth legend, lower values to higher values">',
        '<text x="{}" y="{}" font-family="system-ui, sans-serif" font-size="12" fill="#34495e">Lower</text>'.format(x - 42, text_y),
    ]
    for index, color in enumerate(scale.colors):
        chunks.append('<rect x="{}" y="{}" width="{}" height="{}" fill="{}"/>'.format(x + index * (swatch_width + gap), y, swatch_width, swatch_height, escape(color, quote=True)))
    chunks.append('<text x="{}" y="{}" font-family="system-ui, sans-serif" font-size="12" fill="#34495e">Higher</text>'.format(x + legend_width + 8, text_y))
    if scale.minimum is not None and scale.maximum is not None:
        chunks.append('<title>Values from {} to {}; {} means no data.</title>'.format(escape(formatter(scale.minimum)), escape(formatter(scale.maximum)), escape(scale.empty)))
    chunks.append("</g>")
    return "".join(chunks)


def _coordinate(value: float) -> str:
    return "{:.3f}".format(value).rstrip("0").rstrip(".")


def _default_format(value: float) -> str:
    return "{:g}".format(value)

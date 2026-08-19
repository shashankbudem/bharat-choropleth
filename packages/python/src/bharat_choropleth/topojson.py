"""Small TopoJSON decoder used by the static renderers.

It supports the area geometries a choropleth needs: ``Polygon`` and
``MultiPolygon``.  Shared arcs, reversed arc indexes, quantized/delta encoded
coordinates, holes, and disjoint islands are retained.  No third-party
TopoJSON package is required.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
from os import PathLike
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple, Union

Point = Tuple[float, float]
Ring = Tuple[Point, ...]
TopologyInput = Union[Mapping[str, Any], str, PathLike[str]]


class TopoJSONError(ValueError):
    """Raised when a supplied TopoJSON mapping cannot be decoded."""


@dataclass(frozen=True)
class Feature:
    """One decoded polygon feature.

    ``rings`` is intentionally flat.  SVG's ``fill-rule=evenodd`` correctly
    renders both holes and every disjoint island without requiring callers to
    classify rings.  Coordinates are ``(longitude, latitude)`` pairs.
    """

    id: str
    name: str
    rings: Tuple[Ring, ...]
    properties: Mapping[str, Any]


def load_topology(source: TopologyInput) -> Mapping[str, Any]:
    """Load a TopoJSON mapping from a mapping or a UTF-8 JSON file path."""

    if isinstance(source, Mapping):
        return source
    try:
        with Path(source).open("r", encoding="utf-8") as handle:
            decoded = json.load(handle)
    except (OSError, TypeError, json.JSONDecodeError) as error:
        raise TopoJSONError("could not load TopoJSON input") from error
    if not isinstance(decoded, Mapping):
        raise TopoJSONError("TopoJSON document must be a JSON object")
    return decoded


def decode_topology(
    source: TopologyInput,
    *,
    object_name: Optional[str] = None,
    id_property: str = "id",
    name_property: str = "name",
) -> Tuple[Feature, ...]:
    """Decode a TopoJSON object to area features.

    ``object_name`` selects an entry in the top-level ``objects`` mapping.  If
    omitted, the first object is decoded, matching the generated bundles in
    this repository.  A geometry id wins over ``id_property`` only when that
    property is absent, allowing stable caller-owned ids.
    """

    topology = load_topology(source)
    objects = topology.get("objects")
    if not isinstance(objects, Mapping) or not objects:
        raise TopoJSONError('topology has no non-empty "objects" mapping')
    selected_name = object_name or next(iter(objects))
    selected = objects.get(selected_name)
    if not isinstance(selected, Mapping):
        raise TopoJSONError('topology has no object named "{}"'.format(selected_name))

    arcs = _decode_arcs(topology)
    geometries: Iterable[Any]
    if selected.get("type") == "GeometryCollection":
        geometries = selected.get("geometries", ())
    else:
        geometries = (selected,)

    features: List[Feature] = []
    for geometry in geometries:
        if not isinstance(geometry, Mapping):
            continue
        rings = _geometry_rings(geometry, arcs)
        if rings is None:
            continue
        raw_properties = geometry.get("properties", {})
        properties: Mapping[str, Any] = raw_properties if isinstance(raw_properties, Mapping) else {}
        raw_id = properties.get(id_property, geometry.get("id", properties.get(name_property, "")))
        feature_id = str(raw_id)
        name = str(properties.get(name_property, feature_id))
        features.append(Feature(feature_id, name, rings, properties))
    return tuple(features)


def _decode_arcs(topology: Mapping[str, Any]) -> Tuple[Ring, ...]:
    raw_arcs = topology.get("arcs")
    if not isinstance(raw_arcs, Sequence) or isinstance(raw_arcs, (str, bytes)):
        raise TopoJSONError('topology has no "arcs" list')
    transform = topology.get("transform")
    scale: Optional[Tuple[float, float]] = None
    translate: Optional[Tuple[float, float]] = None
    if transform is not None:
        if not isinstance(transform, Mapping):
            raise TopoJSONError("transform must be an object")
        scale = _pair(transform.get("scale"), "transform.scale")
        translate = _pair(transform.get("translate"), "transform.translate")

    arcs: List[Ring] = []
    for raw_arc in raw_arcs:
        if not isinstance(raw_arc, Sequence) or isinstance(raw_arc, (str, bytes)):
            raise TopoJSONError("an arc is not a list of positions")
        x = 0.0
        y = 0.0
        points: List[Point] = []
        for raw_position in raw_arc:
            px, py = _pair(raw_position, "arc position")
            if scale is not None and translate is not None:
                x += px
                y += py
                points.append((x * scale[0] + translate[0], y * scale[1] + translate[1]))
            else:
                points.append((px, py))
        arcs.append(tuple(points))
    return tuple(arcs)


def _pair(value: Any, label: str) -> Tuple[float, float]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)) or len(value) < 2:
        raise TopoJSONError("{} must be a two-number list".format(label))
    try:
        return float(value[0]), float(value[1])
    except (TypeError, ValueError) as error:
        raise TopoJSONError("{} must contain numbers".format(label)) from error


def _geometry_rings(geometry: Mapping[str, Any], arcs: Tuple[Ring, ...]) -> Optional[Tuple[Ring, ...]]:
    geometry_type = geometry.get("type")
    raw_indexes = geometry.get("arcs", ())
    if geometry_type not in ("Polygon", "MultiPolygon"):
        return None
    if not isinstance(raw_indexes, Sequence) or isinstance(raw_indexes, (str, bytes)):
        return tuple()
    rings: List[Ring] = []
    if geometry_type == "Polygon":
        for ring_indexes in raw_indexes:
            rings.append(_stitch(ring_indexes, arcs))
    else:
        for polygon in raw_indexes:
            if not isinstance(polygon, Sequence) or isinstance(polygon, (str, bytes)):
                raise TopoJSONError("a multipolygon part is not a list of rings")
            for ring_indexes in polygon:
                rings.append(_stitch(ring_indexes, arcs))
    return tuple(rings)


def _stitch(raw_indexes: Any, arcs: Tuple[Ring, ...]) -> Ring:
    if not isinstance(raw_indexes, Sequence) or isinstance(raw_indexes, (str, bytes)):
        raise TopoJSONError("a ring is not a list of arc indexes")
    stitched: List[Point] = []
    for raw_index in raw_indexes:
        if not isinstance(raw_index, (int, float)):
            raise TopoJSONError("an arc index is not numeric")
        index = int(raw_index)
        arc_index = ~index if index < 0 else index
        if arc_index < 0 or arc_index >= len(arcs):
            raise TopoJSONError("arc index {} is out of range".format(index))
        arc = arcs[arc_index]
        points = tuple(reversed(arc)) if index < 0 else arc
        stitched.extend(points if not stitched else points[1:])
    return tuple(stitched)

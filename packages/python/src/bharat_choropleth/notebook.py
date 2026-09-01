"""Optional state-to-district-to-sub-district controls for Jupyter notebooks.

Install with ``pip install 'bharat-choropleth[notebook]'``.  The notebook
adapter deliberately delegates map drawing to :func:`render_svg`, leaving the
base package free of Jupyter and browser dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Mapping, Optional, Sequence, Union

from .svg import FeatureInput, ValueMapping, render_svg
from .topojson import Feature, TopologyInput, decode_topology

DistrictLoader = Callable[[str], Union[TopologyInput, FeatureInput]]
DistrictValues = Union[Mapping[str, Mapping[str, object]], Callable[[str], Mapping[str, object]]]
#: Receives a district id and returns that district's sub-districts, or ``None``
#: for a district that has no sub-district level.  Not every district has one —
#: a source can omit them, or hold none falling inside the district — and such a
#: district is left as a leaf rather than opening an empty map.
SubDistrictLoader = Callable[[str], Optional[Union[TopologyInput, FeatureInput]]]
SubDistrictValues = Union[Mapping[str, Mapping[str, object]], Callable[[str], Mapping[str, object]]]


def _widgets():
    try:
        import ipywidgets as widgets
    except ImportError as error:  # pragma: no cover - exercised by notebook users without the optional extra.
        raise ImportError(
            "Notebook support requires ipywidgets. Install it with "
            "pip install 'bharat-choropleth[notebook]'."
        ) from error
    return widgets


@dataclass
class NotebookChoropleth:
    """An inline, lazy state-to-district SVG control for Jupyter.

    ``district_loader`` runs only after a state is selected.  It receives the
    stable state id and returns either that state's district TopoJSON or a
    sequence of decoded :class:`Feature` objects.  ``district_values`` can be
    a mapping keyed by state id or a callable that resolves a mapping lazily.

    Pass ``sub_district_loader`` for a third level.  It runs only after a
    district is selected and follows the same contract as the JavaScript,
    React and Flutter packages: returning ``None`` marks that district a leaf,
    which keeps the district view rather than opening an empty one, and the
    district is not asked again.  Omit it and the control is state-to-district
    exactly as before, with no district selector shown at all.
    """

    states: Union[TopologyInput, FeatureInput]
    state_values: ValueMapping
    district_loader: DistrictLoader
    district_values: Optional[DistrictValues] = None
    sub_district_loader: Optional[SubDistrictLoader] = None
    sub_district_values: Optional[SubDistrictValues] = None
    states_object_name: Optional[str] = None
    districts_object_name: Optional[str] = "districts"
    subdistricts_object_name: Optional[str] = "subdistricts"
    width: int = 960
    height: int = 640
    title: str = "India choropleth"
    _features: Sequence[Feature] = field(init=False, repr=False)
    _selected_id: Optional[str] = field(default=None, init=False, repr=False)
    _selected_district_id: Optional[str] = field(default=None, init=False, repr=False)
    _district_features: Sequence[Feature] = field(default=(), init=False, repr=False)
    #: Districts the loader has already answered ``None`` for, so a second
    #: selection does not re-ask a question already answered.
    _leaf_district_ids: set = field(default_factory=set, init=False, repr=False)
    #: Guards the observers while the code sets a dropdown's value itself, which
    #: would otherwise re-enter and undo the navigation being performed.
    _suppress: bool = field(default=False, init=False, repr=False)
    _selector: object = field(init=False, repr=False)
    _district_selector: object = field(init=False, repr=False)
    _back: object = field(init=False, repr=False)
    _map: object = field(init=False, repr=False)
    _status: object = field(init=False, repr=False)
    widget: object = field(init=False)

    def __post_init__(self) -> None:
        widgets = _widgets()
        self._features = _coerce_features(self.states, self.states_object_name)
        options = [("All states", None)] + [(feature.name, feature.id) for feature in self._features]
        self._selector = widgets.Dropdown(options=options, value=None, description="Region:")
        self._district_selector = widgets.Dropdown(
            options=[("All districts", None)], value=None, description="District:", disabled=True
        )
        self._back = widgets.Button(description="Back to states", disabled=True)
        self._map = widgets.HTML()
        self._status = widgets.HTML()
        # The district selector only exists where there is a level below it, so a
        # two-level caller sees exactly the control it saw before.
        controls = [self._selector]
        if self.sub_district_loader is not None:
            controls.append(self._district_selector)
        controls.append(self._back)
        self.widget = widgets.VBox([widgets.HBox(controls), self._status, self._map])
        self._selector.observe(self._on_selection, names="value")
        self._district_selector.observe(self._on_district_selection, names="value")
        self._back.on_click(self._on_back)
        self._render_states()

    @property
    def selected_id(self) -> Optional[str]:
        """The selected state id, or ``None`` at the national level."""

        return self._selected_id

    @property
    def selected_district_id(self) -> Optional[str]:
        """The drilled district id, or ``None`` above the sub-district level."""

        return self._selected_district_id

    def select(self, state_id: Optional[str]) -> None:
        """Programmatically select a state, or ``None`` to return home."""

        self._selector.value = state_id

    def select_district(self, district_id: Optional[str]) -> None:
        """Drill into a district, or ``None`` to return to the district view.

        Only meaningful once a state is selected and a ``sub_district_loader``
        was supplied.
        """

        self._district_selector.value = district_id

    def _on_selection(self, change: Mapping[str, object]) -> None:
        if self._suppress:
            return
        self._selected_id = change.get("new") if isinstance(change.get("new"), str) else None
        # A district id means nothing outside the state it came from, so changing
        # states always drops the level below rather than carrying it across.
        self._reset_district_selector()
        if self._selected_id is None:
            self._render_states()
            return
        self._render_districts(self._selected_id)

    def _on_district_selection(self, change: Mapping[str, object]) -> None:
        if self._suppress:
            return
        district_id = change.get("new") if isinstance(change.get("new"), str) else None
        self._selected_district_id = district_id
        if district_id is None:
            if self._selected_id is not None:
                self._render_districts(self._selected_id, reload=False)
            return
        self._render_subdistricts(district_id)

    def _on_back(self, _button: object) -> None:
        # One level, not all the way out: from sub-districts this returns to the
        # districts, matching the middle breadcrumb crumb in the other renderers.
        if self._selected_district_id is not None:
            self._district_selector.value = None
            return
        self._selector.value = None

    def _reset_district_selector(self) -> None:
        """Clear the district level without re-entering the observers."""

        self._suppress = True
        try:
            self._district_selector.options = [("All districts", None)]
            self._district_selector.value = None
            self._district_selector.disabled = True
        finally:
            self._suppress = False
        self._selected_district_id = None

    def _render_states(self) -> None:
        self._back.disabled = True
        self._back.description = "Back to states"
        self._status.value = "<small>Select a state or union territory to view its districts.</small>"
        self._map.value = render_svg(
            self._features,
            self.state_values,
            width=self.width,
            height=self.height,
            title=self.title,
            description="Choose a region in the notebook control to drill into its districts.",
        )

    def _render_districts(self, state_id: str, *, reload: bool = True) -> None:
        state = next((feature for feature in self._features if feature.id == state_id), None)
        if state is None:
            self._status.value = "<small>Unknown state selection.</small>"
            return
        self._back.disabled = False
        self._back.description = "Back to states"
        if reload:
            self._status.value = "<small>Loading districts for {}…</small>".format(state.name)
        try:
            if reload:
                self._district_features = _coerce_features(
                    self.district_loader(state_id), self.districts_object_name
                )
                self._populate_district_selector()
            values = self._district_values_for(state_id)
            self._map.value = render_svg(
                self._district_features,
                values,
                width=self.width,
                height=self.height,
                title="Districts of {}".format(state.name),
                description="Use Back to states to return to the national map.",
            )
            self._status.value = "<small>District view: {}</small>".format(state.name)
        except Exception as error:
            self._status.value = "<small>Could not load districts for {}: {}</small>".format(state.name, error)

    def _populate_district_selector(self) -> None:
        """Offer the loaded districts, minus the ones already known to be leaves."""

        if self.sub_district_loader is None:
            return
        options = [("All districts", None)] + [
            (feature.name, feature.id)
            for feature in self._district_features
            if feature.id not in self._leaf_district_ids
        ]
        self._suppress = True
        try:
            self._district_selector.options = options
            self._district_selector.value = None
            self._district_selector.disabled = len(options) <= 1
        finally:
            self._suppress = False

    def _render_subdistricts(self, district_id: str) -> None:
        loader = self.sub_district_loader
        district = next((f for f in self._district_features if f.id == district_id), None)
        if loader is None or district is None:
            self._status.value = "<small>Unknown district selection.</small>"
            return
        self._status.value = "<small>Loading sub-districts for {}…</small>".format(district.name)
        try:
            loaded = loader(district_id)
        except Exception as error:
            self._status.value = "<small>Could not load sub-districts for {}: {}</small>".format(
                district.name, error
            )
            return

        if loaded is None:
            # A leaf. Stay on the district view rather than opening an empty
            # level, and stop offering the district so it is not asked again.
            self._leaf_district_ids.add(district_id)
            self._selected_district_id = None
            if self._selected_id is not None:
                self._render_districts(self._selected_id, reload=False)
            self._populate_district_selector()
            self._status.value = "<small>{} has no sub-district level.</small>".format(district.name)
            return

        try:
            subdistricts = _coerce_features(loaded, self.subdistricts_object_name)
            self._map.value = render_svg(
                subdistricts,
                self._sub_district_values_for(district_id),
                width=self.width,
                height=self.height,
                title="Sub-districts of {}".format(district.name),
                description="Use Back to districts to return to the district map.",
            )
            self._back.disabled = False
            self._back.description = "Back to districts"
            self._status.value = "<small>Sub-district view: {}</small>".format(district.name)
        except Exception as error:
            self._status.value = "<small>Could not load sub-districts for {}: {}</small>".format(
                district.name, error
            )

    def _district_values_for(self, state_id: str) -> Mapping[str, object]:
        return _resolve_values(self.district_values, state_id)

    def _sub_district_values_for(self, district_id: str) -> Mapping[str, object]:
        return _resolve_values(self.sub_district_values, district_id)


def notebook_drilldown(
    states: Union[TopologyInput, FeatureInput],
    state_values: ValueMapping,
    district_loader: DistrictLoader,
    **kwargs: object,
) -> NotebookChoropleth:
    """Create a :class:`NotebookChoropleth` for display in Jupyter.

    Display ``controller.widget`` in a notebook.  The state selector drives
    lazy district loading and replaces the inline SVG without a browser map
    dependency.  Pass ``sub_district_loader=`` for a third level; see
    :class:`NotebookChoropleth` for its leaf contract.
    """

    return NotebookChoropleth(states, state_values, district_loader, **kwargs)


def _resolve_values(
    values: Optional[Union[Mapping[str, Mapping[str, object]], Callable[[str], Mapping[str, object]]]],
    key: str,
) -> Mapping[str, object]:
    """A per-level mapping, from either a dict keyed by parent id or a callable."""

    if values is None:
        return {}
    if callable(values):
        return values(key)
    return values.get(key, {})


def _coerce_features(source: Union[TopologyInput, FeatureInput], object_name: Optional[str]) -> Sequence[Feature]:
    if isinstance(source, Sequence) and not isinstance(source, (str, bytes)) and all(isinstance(item, Feature) for item in source):
        return tuple(source)
    return decode_topology(source, object_name=object_name)  # type: ignore[arg-type]

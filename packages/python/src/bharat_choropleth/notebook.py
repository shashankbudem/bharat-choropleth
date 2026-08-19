"""Optional state-to-district controls for Jupyter notebooks.

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
    """

    states: Union[TopologyInput, FeatureInput]
    state_values: ValueMapping
    district_loader: DistrictLoader
    district_values: Optional[DistrictValues] = None
    states_object_name: Optional[str] = None
    districts_object_name: Optional[str] = "districts"
    width: int = 960
    height: int = 640
    title: str = "India choropleth"
    _features: Sequence[Feature] = field(init=False, repr=False)
    _selected_id: Optional[str] = field(default=None, init=False, repr=False)
    _selector: object = field(init=False, repr=False)
    _back: object = field(init=False, repr=False)
    _map: object = field(init=False, repr=False)
    _status: object = field(init=False, repr=False)
    widget: object = field(init=False)

    def __post_init__(self) -> None:
        widgets = _widgets()
        self._features = _coerce_features(self.states, self.states_object_name)
        options = [("All states", None)] + [(feature.name, feature.id) for feature in self._features]
        self._selector = widgets.Dropdown(options=options, value=None, description="Region:")
        self._back = widgets.Button(description="Back to states", disabled=True)
        self._map = widgets.HTML()
        self._status = widgets.HTML()
        self.widget = widgets.VBox([widgets.HBox([self._selector, self._back]), self._status, self._map])
        self._selector.observe(self._on_selection, names="value")
        self._back.on_click(self._on_back)
        self._render_states()

    @property
    def selected_id(self) -> Optional[str]:
        """The selected state id, or ``None`` at the national level."""

        return self._selected_id

    def select(self, state_id: Optional[str]) -> None:
        """Programmatically select a state, or ``None`` to return home."""

        self._selector.value = state_id

    def _on_selection(self, change: Mapping[str, object]) -> None:
        self._selected_id = change.get("new") if isinstance(change.get("new"), str) else None
        if self._selected_id is None:
            self._render_states()
            return
        self._render_districts(self._selected_id)

    def _on_back(self, _button: object) -> None:
        self._selector.value = None

    def _render_states(self) -> None:
        self._back.disabled = True
        self._status.value = "<small>Select a state or union territory to view its districts.</small>"
        self._map.value = render_svg(
            self._features,
            self.state_values,
            width=self.width,
            height=self.height,
            title=self.title,
            description="Choose a region in the notebook control to drill into its districts.",
        )

    def _render_districts(self, state_id: str) -> None:
        state = next((feature for feature in self._features if feature.id == state_id), None)
        if state is None:
            self._status.value = "<small>Unknown state selection.</small>"
            return
        self._back.disabled = False
        self._status.value = "<small>Loading districts for {}…</small>".format(state.name)
        try:
            districts = _coerce_features(self.district_loader(state_id), self.districts_object_name)
            values = self._district_values_for(state_id)
            self._map.value = render_svg(
                districts,
                values,
                width=self.width,
                height=self.height,
                title="Districts of {}".format(state.name),
                description="Use Back to states to return to the national map.",
            )
            self._status.value = "<small>District view: {}</small>".format(state.name)
        except Exception as error:
            self._status.value = "<small>Could not load districts for {}: {}</small>".format(state.name, error)

    def _district_values_for(self, state_id: str) -> Mapping[str, object]:
        if self.district_values is None:
            return {}
        if callable(self.district_values):
            return self.district_values(state_id)
        return self.district_values.get(state_id, {})


def notebook_drilldown(
    states: Union[TopologyInput, FeatureInput],
    state_values: ValueMapping,
    district_loader: DistrictLoader,
    **kwargs: object,
) -> NotebookChoropleth:
    """Create a :class:`NotebookChoropleth` for display in Jupyter.

    Display ``controller.widget`` in a notebook.  The state selector drives
    lazy district loading and replaces the inline SVG without a browser map
    dependency.
    """

    return NotebookChoropleth(states, state_values, district_loader, **kwargs)


def _coerce_features(source: Union[TopologyInput, FeatureInput], object_name: Optional[str]) -> Sequence[Feature]:
    if isinstance(source, Sequence) and not isinstance(source, (str, bytes)) and all(isinstance(item, Feature) for item in source):
        return tuple(source)
    return decode_topology(source, object_name=object_name)  # type: ignore[arg-type]

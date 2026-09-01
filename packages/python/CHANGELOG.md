# Changelog

## 0.1.0

- Initial static SVG renderer for TopoJSON and GeoJSON-style polygon features.
- Dependency-free numeric colour scale and accessible legend.
- Optional Matplotlib renderer, installed with `bharat-choropleth[matplotlib]`.
- Optional ipywidgets notebook control, installed with
  `bharat-choropleth[notebook]`, drilling state → district → sub-district.
  `sub_district_loader` is called only after a district is selected and
  returning `None` marks that district a leaf, keeping the district view rather
  than opening an empty one. Omit it and the control stays state-to-district
  with no district selector shown.

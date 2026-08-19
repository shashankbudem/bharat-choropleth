import unittest

import package_path  # noqa: F401  (adds the local src/ directory)
from bharat_choropleth import ColorScale, render_svg

from test_topojson import TOPOLOGY


class RenderingTest(unittest.TestCase):
    def test_color_scale_keeps_missing_values_separate(self):
        scale = ColorScale.fit([1, None, 3])

        self.assertEqual(scale.color_for_value(None), "#e7edf0")
        self.assertEqual(scale.color_for_value(1), "#d9f1ed")
        self.assertEqual(scale.color_for_value(3), "#075b55")

    def test_svg_is_accessible_and_keeps_both_islands(self):
        svg = render_svg(
            TOPOLOGY,
            {"islands": 43},
            object_name="regions",
            title="Island metric",
            description="A test map",
            width=200,
            height=120,
        )

        self.assertIn('role="img"', svg)
        self.assertIn('aria-label="Islands, 43"', svg)
        self.assertIn('fill-rule="evenodd"', svg)
        self.assertEqual(svg.count("M "), 2)
        self.assertIn("Lower", svg)

    def test_svg_marks_absent_values_as_no_data(self):
        svg = render_svg(TOPOLOGY, {}, object_name="regions")

        self.assertIn("Islands, No data", svg)
        self.assertIn('fill="#e7edf0"', svg)

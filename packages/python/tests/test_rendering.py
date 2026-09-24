import re
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

    def test_color_scale_rounds_halves_up_like_the_web_and_flutter_renderers(self):
        # 0..12 across seven colours puts 1, 5 and 9 exactly half-way between two
        # swatches. Python's round() sends a half to the even neighbour; the
        # JavaScript and Dart renderers send it up, so the same data coloured
        # differently depending on which package drew it.
        scale = ColorScale.fit([0, 12])
        colors = ColorScale().colors

        self.assertEqual(scale.color_for_value(1), colors[1])
        self.assertEqual(scale.color_for_value(5), colors[3])
        self.assertEqual(scale.color_for_value(9), colors[5])

    def test_two_maps_on_one_page_do_not_share_ids(self):
        # A notebook shows several maps in one document. Repeated ids there make
        # the second map's aria-labelledby name it with the first map's title.
        first = render_svg(TOPOLOGY, {}, object_name="regions", title="First", description="One")
        second = render_svg(TOPOLOGY, {}, object_name="regions", title="Second", description="Two")

        first_ids = set(re.findall(r' id="([^"]+)"', first))
        second_ids = set(re.findall(r' id="([^"]+)"', second))
        self.assertTrue(first_ids)
        self.assertEqual(first_ids & second_ids, set())
        labelled_by = re.search(r'aria-labelledby="([^"]+)"', second).group(1).split()
        self.assertTrue(set(labelled_by) <= second_ids)

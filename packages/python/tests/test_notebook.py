import unittest

import package_path  # noqa: F401  (adds the local src/ directory)

from bharat_choropleth.notebook import notebook_drilldown

from test_topojson import TOPOLOGY


try:
    import ipywidgets  # noqa: F401
except ImportError:
    WIDGETS_AVAILABLE = False
else:
    WIDGETS_AVAILABLE = True


@unittest.skipUnless(WIDGETS_AVAILABLE, "ipywidgets is an optional dependency")
class NotebookTest(unittest.TestCase):
    def test_selecting_a_state_lazily_renders_its_districts(self):
        calls = []

        def load_districts(state_id):
            calls.append(state_id)
            return TOPOLOGY

        control = notebook_drilldown(
            TOPOLOGY,
            {"islands": 43},
            load_districts,
            states_object_name="regions",
            districts_object_name="regions",
        )

        self.assertEqual(calls, [])
        self.assertIn("Select a state", control._status.value)
        control.select("islands")
        self.assertEqual(calls, ["islands"])
        self.assertEqual(control.selected_id, "islands")
        self.assertIn("District view: Islands", control._status.value)
        self.assertIn("Districts of Islands", control._map.value)
        control.select(None)
        self.assertIsNone(control.selected_id)
        self.assertIn("Select a state", control._status.value)

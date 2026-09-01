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

    def test_two_level_callers_get_no_district_selector(self):
        control = notebook_drilldown(
            TOPOLOGY,
            {"islands": 43},
            lambda state_id: TOPOLOGY,
            states_object_name="regions",
            districts_object_name="regions",
        )

        # The control a two-level caller had before sub-districts existed.
        controls = control.widget.children[0].children
        self.assertNotIn(control._district_selector, controls)

    def _three_level(self, sub_loader, calls=None):
        return notebook_drilldown(
            TOPOLOGY,
            {"islands": 43},
            lambda state_id: TOPOLOGY,
            sub_district_loader=sub_loader,
            states_object_name="regions",
            districts_object_name="regions",
            subdistricts_object_name="regions",
        )

    def test_selecting_a_district_lazily_renders_its_sub_districts(self):
        calls = []

        def load_sub_districts(district_id):
            calls.append(district_id)
            return TOPOLOGY

        control = self._three_level(load_sub_districts)
        self.assertIn(control._district_selector, control.widget.children[0].children)

        control.select("islands")
        self.assertEqual(calls, [])  # not until a district is chosen
        self.assertFalse(control._district_selector.disabled)

        control.select_district("islands")
        self.assertEqual(calls, ["islands"])
        self.assertEqual(control.selected_district_id, "islands")
        self.assertIn("Sub-district view: Islands", control._status.value)
        self.assertIn("Sub-districts of Islands", control._map.value)

    def test_back_steps_one_level_rather_than_returning_home(self):
        control = self._three_level(lambda district_id: TOPOLOGY)
        control.select("islands")
        control.select_district("islands")
        self.assertEqual(control._back.description, "Back to districts")

        control._on_back(None)
        # Back at the districts, with the state drill-down still intact.
        self.assertIsNone(control.selected_district_id)
        self.assertEqual(control.selected_id, "islands")
        self.assertIn("District view: Islands", control._status.value)
        self.assertEqual(control._back.description, "Back to states")

        control._on_back(None)
        self.assertIsNone(control.selected_id)

    def test_a_district_with_no_sub_districts_stays_a_leaf(self):
        calls = []

        def load_sub_districts(district_id):
            calls.append(district_id)
            return None

        control = self._three_level(load_sub_districts)
        control.select("islands")
        control.select_district("islands")

        self.assertEqual(calls, ["islands"])
        self.assertIsNone(control.selected_district_id)
        self.assertIn("no sub-district level", control._status.value)
        # Still the district view, not an empty sub-district one.
        self.assertIn("Districts of Islands", control._map.value)
        # And no longer offered, so the same question is not asked twice.
        self.assertNotIn("islands", [value for _, value in control._district_selector.options])

    def test_changing_state_drops_the_district_level(self):
        control = self._three_level(lambda district_id: TOPOLOGY)
        control.select("islands")
        control.select_district("islands")
        self.assertEqual(control.selected_district_id, "islands")

        control.select(None)
        self.assertIsNone(control.selected_district_id)
        self.assertTrue(control._district_selector.disabled)
        self.assertIn("Select a state", control._status.value)

    def test_a_failed_sub_district_load_reports_rather_than_blanking(self):
        def load_sub_districts(district_id):
            raise RuntimeError("nope")

        control = self._three_level(load_sub_districts)
        control.select("islands")
        control.select_district("islands")
        self.assertIn("Could not load sub-districts", control._status.value)

"""The state registry, and the value lookup built on it.

The parity half mirrors ``packages/flutter/test/state_resolution_test.dart``:
``packages/js/src/states.ts`` is the source of truth, the two TypeScript
packages share it byte-for-byte, and the ports in Dart and Python are held to it
by behaviour instead — every spelling the JavaScript registry accepts, recorded
in a fixture and replayed here.
"""

import json
import unittest
from pathlib import Path

import package_path  # noqa: F401  (puts ../src on sys.path)

from bharat_choropleth import normalize_state_key, resolve_state, value_for
from bharat_choropleth.states import STATES
from bharat_choropleth.topojson import Feature


def _feature(identifier: str, name: str) -> Feature:
    """A feature with no geometry: these tests only exercise key matching."""
    return Feature(id=identifier, name=name, rings=(), properties={})


class StateRegistryParityTest(unittest.TestCase):
    """Every spelling the JavaScript registry accepts must resolve the same here."""

    @classmethod
    def setUpClass(cls):
        fixture = Path(__file__).resolve().parents[3] / "packages/js/test/state-resolution-cases.json"
        if not fixture.exists():
            raise unittest.SkipTest("the shared fixture is not part of the package sdist")
        cls.cases = json.loads(fixture.read_text())

    def test_holds_the_same_number_of_states(self):
        self.assertEqual(len(STATES), self.cases["states"])

    def test_resolves_every_recorded_spelling_to_the_same_id(self):
        mismatches = []
        for spelling, expected in self.cases["resolves"].items():
            resolved = resolve_state(spelling)
            actual = resolved.id if resolved else None
            if actual != expected:
                mismatches.append("{!r} -> {}, expected {}".format(spelling, actual, expected))
        self.assertEqual(mismatches, [], "Python and JavaScript registries disagree:\n" + "\n".join(mismatches))

    def test_declines_the_spellings_recorded_as_unresolvable(self):
        for value in self.cases["doesNotResolve"]:
            self.assertIsNone(resolve_state(value), "{!r} should not resolve".format(value))

    def test_normalizes_the_way_the_javascript_registry_does(self):
        self.assertEqual(normalize_state_key("Tamil Nadu"), "tamil-nadu")
        self.assertEqual(normalize_state_key("TAMIL-NADU"), "tamil-nadu")
        self.assertEqual(normalize_state_key("tamil_nadu"), "tamil-nadu")
        self.assertEqual(normalize_state_key("Jammu & Kashmir"), "jammu-and-kashmir")
        self.assertEqual(normalize_state_key("  Goa  "), "goa")


class ValueLookupTest(unittest.TestCase):
    """What the registry buys a caller: their own spelling reaches the region."""

    def test_matches_a_display_name_and_any_casing_of_it(self):
        goa = _feature("in-cs-30-goa", "Goa")
        self.assertEqual(value_for({"Goa": 6}, goa), 6)
        self.assertEqual(value_for({"goa": 6}, goa), 6)
        self.assertEqual(value_for({"GOA": 6}, goa), 6)

    def test_matches_slugs_separator_free_forms_and_former_names(self):
        self.assertEqual(value_for({"tamilnadu": 18}, _feature("in-cs-33-tamil-nadu", "Tamil Nadu")), 18)
        self.assertEqual(value_for({"jammu-and-kashmir": 2}, _feature("in-cs-01-jammu-and-kashmir", "Jammu & Kashmir")), 2)
        # The point of the alias table: someone who learned the older name.
        self.assertEqual(value_for({"Orissa": 8}, _feature("in-cs-21-odisha", "Odisha")), 8)

    def test_prefers_an_exact_id_so_bundle_keyed_data_is_untouched(self):
        # Both keys address the same region; the literal id must win, which is
        # what keeps a drill-down layer keyed by its own ids behaving exactly as
        # it did before the registry existed.
        goa = _feature("in-cs-30-goa", "Goa")
        self.assertEqual(value_for({"in-cs-30-goa": 6, "Goa": 99}, goa), 6)

    def test_matches_ids_the_registry_does_not_know(self):
        # The historical Census bundle uses in-hs-* ids, and district ids are not
        # in the registry at all. Keying by them has to keep working.
        self.assertEqual(value_for({"in-hs-30-goa": 6}, _feature("in-hs-30-goa", "Goa")), 6)
        self.assertEqual(value_for({"in-cd-30-585": 90}, _feature("in-cd-30-585", "North Goa")), 90)

    def test_matches_below_the_state_level_case_insensitively(self):
        # No registry down here, so this is the normalized fallback doing it.
        self.assertEqual(value_for({"south goa": 76}, _feature("in-cd-30-586", "South Goa")), 76)

    def test_an_explicit_none_is_no_data_rather_than_a_fallthrough(self):
        goa = _feature("in-cs-30-goa", "Goa")
        self.assertIsNone(value_for({"in-cs-30-goa": None, "Goa": 99}, goa))

    def test_an_unrecognized_key_leaves_the_region_without_a_value(self):
        self.assertIsNone(value_for({"Xanadu": 99}, _feature("in-cs-30-goa", "Goa")))


if __name__ == "__main__":
    unittest.main()

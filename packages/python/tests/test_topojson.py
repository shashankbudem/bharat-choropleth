import json
from pathlib import Path
import unittest

import package_path  # noqa: F401  (adds the local src/ directory)
from bharat_choropleth import TopoJSONError, decode_topology


TOPOLOGY = {
    "type": "Topology",
    "transform": {"scale": [1, 1], "translate": [0, 0]},
    "objects": {
        "regions": {
            "type": "GeometryCollection",
            "geometries": [
                {
                    "type": "MultiPolygon",
                    "id": "fallback",
                    "properties": {"id": "islands", "name": "Islands"},
                    "arcs": [[[0]], [[1]]],
                }
            ],
        }
    },
    "arcs": [
        [[0, 0], [2, 0], [0, 2], [-2, 0], [0, -2]],
        [[4, 0], [2, 0], [0, 2], [-2, 0], [0, -2]],
    ],
}


class TopoJSONTest(unittest.TestCase):
    def test_decodes_quantized_multipart_feature(self):
        features = decode_topology(TOPOLOGY, object_name="regions")

        self.assertEqual(len(features), 1)
        self.assertEqual(features[0].id, "islands")
        self.assertEqual(features[0].name, "Islands")
        self.assertEqual(len(features[0].rings), 2)
        self.assertEqual(features[0].rings[0][2], (2.0, 2.0))
        self.assertEqual(features[0].rings[1][0], (4.0, 0.0))

    def test_decodes_repo_current_bundle(self):
        root = Path(__file__).resolve().parents[3]
        bundle = root / "data/generated/current-2019-states/states.topo.json"
        if not bundle.exists():
            self.skipTest("repository boundary bundle is intentionally not included in the package sdist")
        features = decode_topology(bundle, object_name="states")

        self.assertEqual(len(features), 36)
        lakshadweep = next(feature for feature in features if feature.id == "in-cs-31-lakshadweep")
        self.assertGreater(len(lakshadweep.rings), 10)

    def test_reports_unknown_object(self):
        with self.assertRaises(TopoJSONError):
            decode_topology(TOPOLOGY, object_name="missing")

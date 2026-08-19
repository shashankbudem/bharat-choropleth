import 'package:bharat_choropleth/bharat_choropleth.dart';
import 'package:flutter_test/flutter_test.dart';

/// One arc tracing a 10x10 square counter-clockwise from the origin, stored the
/// way a quantized topology stores it: each position is a delta from the last.
Map<String, Object?> squareTopology({
  List<double> scale = const [1, 1],
  List<double> translate = const [0, 0],
  Object? arcs,
}) =>
    <String, Object?>{
      'type': 'Topology',
      'transform': {'scale': scale, 'translate': translate},
      'arcs': [
        [
          [0, 0],
          [10, 0],
          [0, 10],
          [-10, 0],
          [0, -10],
        ],
      ],
      'objects': {
        'states': {
          'type': 'GeometryCollection',
          'geometries': [
            {
              'type': 'Polygon',
              'arcs': arcs ?? [
                [0],
              ],
              'properties': {'id': 'a', 'name': 'Alpha'},
            },
          ],
        },
      },
    };

void main() {
  group('decodeTopoJson', () {
    test('delta-decodes arc positions into absolute coordinates', () {
      final features = decodeTopoJson(squareTopology());
      expect(features, hasLength(1));
      expect(features.single.rings.single, const [
        Offset(0, 0),
        Offset(10, 0),
        Offset(10, 10),
        Offset(0, 10),
        Offset(0, 0),
      ]);
    });

    test('applies the topology transform to every decoded position', () {
      final features = decodeTopoJson(squareTopology(scale: [0.5, 2], translate: [100, 50]));
      expect(features.single.rings.single, const [
        Offset(100, 50),
        Offset(105, 50),
        Offset(105, 70),
        Offset(100, 70),
        Offset(100, 50),
      ]);
    });

    test('reads absolute coordinates when the topology has no transform', () {
      final topology = Map<String, Object?>.from(squareTopology())..remove('transform');
      final features = decodeTopoJson(topology);
      // Without a transform the positions are literal, not deltas.
      expect(features.single.rings.single, const [
        Offset(0, 0),
        Offset(10, 0),
        Offset(0, 10),
        Offset(-10, 0),
        Offset(0, -10),
      ]);
    });

    test('a negative arc index means that arc reversed', () {
      final features = decodeTopoJson(squareTopology(arcs: [
        [-1],
      ]));
      expect(features.single.rings.single, const [
        Offset(0, 0),
        Offset(0, 10),
        Offset(10, 10),
        Offset(10, 0),
        Offset(0, 0),
      ]);
    });

    test('stitches consecutive arcs without duplicating the shared endpoint', () {
      final topology = <String, Object?>{
        'type': 'Topology',
        'arcs': [
          [
            [0, 0],
            [10, 0],
          ],
          [
            [10, 0], // shared with the end of arc 0
            [10, 10],
          ],
        ],
        'objects': {
          'states': {
            'type': 'GeometryCollection',
            'geometries': [
              {
                'type': 'Polygon',
                'arcs': [
                  [0, 1],
                ],
                'properties': {'id': 'a', 'name': 'Alpha'},
              },
            ],
          },
        },
      };
      expect(decodeTopoJson(topology).single.rings.single, const [
        Offset(0, 0),
        Offset(10, 0),
        Offset(10, 10),
      ]);
    });

    test('flattens a MultiPolygon into one ring list, so islands all render', () {
      final topology = <String, Object?>{
        'type': 'Topology',
        'arcs': [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
          [
            [5, 5],
            [6, 5],
            [6, 6],
            [5, 5],
          ],
        ],
        'objects': {
          'states': {
            'type': 'GeometryCollection',
            'geometries': [
              {
                'type': 'MultiPolygon',
                'arcs': [
                  [
                    [0],
                  ],
                  [
                    [1],
                  ],
                ],
                'properties': {'id': 'islands', 'name': 'Islands'},
              },
            ],
          },
        },
      };
      expect(decodeTopoJson(topology).single.rings, hasLength(2));
    });

    test('reads id and name from properties, falling back to each other', () {
      final features = decodeTopoJson(squareTopology());
      expect(features.single.id, 'a');
      expect(features.single.name, 'Alpha');
    });

    test('accepts custom id and name readers for third-party data', () {
      final topology = squareTopology();
      final states = (topology['objects'] as Map)['states'] as Map;
      (states['geometries'] as List).first['properties'] = {'code': 'GA', 'title': 'Goa'};

      final features = decodeTopoJson(
        topology,
        getId: (p) => p['code'].toString(),
        getName: (p) => p['title'].toString(),
      );
      expect(features.single.id, 'GA');
      expect(features.single.name, 'Goa');
    });

    test('picks the named object, and defaults to the first one', () {
      expect(decodeTopoJson(squareTopology(), objectName: 'states'), hasLength(1));
      expect(
        () => decodeTopoJson(squareTopology(), objectName: 'districts'),
        throwsA(isA<TopoJsonException>()),
      );
    });

    test('rejects payloads that are not TopoJSON, instead of drawing nothing', () {
      expect(() => decodeTopoJson({'type': 'FeatureCollection'}), throwsA(isA<TopoJsonException>()));
      expect(() => decodeTopoJson({'objects': <String, Object?>{}}), throwsA(isA<TopoJsonException>()));
    });

    test('rejects an out-of-range arc index rather than silently skipping it', () {
      expect(
        () => decodeTopoJson(squareTopology(arcs: [
          [7],
        ])),
        throwsA(isA<TopoJsonException>()),
      );
    });

    test('skips non-area geometries, which a choropleth cannot fill', () {
      final topology = <String, Object?>{
        'type': 'Topology',
        'arcs': [
          [
            [0, 0],
            [1, 1],
          ],
        ],
        'objects': {
          'lines': {
            'type': 'GeometryCollection',
            'geometries': [
              {
                'type': 'LineString',
                'arcs': [0],
                'properties': {'id': 'l', 'name': 'Line'},
              },
            ],
          },
        },
      };
      expect(decodeTopoJson(topology), isEmpty);
    });
  });
}

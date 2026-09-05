import 'dart:convert';
import 'dart:io';

import 'package:bharat_choropleth/src/states.dart';
import 'package:flutter_test/flutter_test.dart';

/// The other half of the guard described in `lib/src/states.dart`.
///
/// `packages/js/test/state-resolution-cases.json` records every spelling the
/// JavaScript registry accepts and the id it resolves to. This replays all of
/// them against the Dart translation. The two registries cannot be diffed as
/// text, so they are held together by behaviour instead: if either drifts, this
/// fails, or its JavaScript counterpart does.
void main() {
  final fixture = jsonDecode(
    File('../js/test/state-resolution-cases.json').readAsStringSync(),
  ) as Map<String, dynamic>;
  final resolves = (fixture['resolves'] as Map<String, dynamic>).cast<String, String>();
  final doesNotResolve = (fixture['doesNotResolve'] as List<dynamic>).cast<String>();

  group('state registry parity with the JavaScript package', () {
    test('holds the same number of states', () {
      expect(kStates.length, fixture['states']);
    });

    test('resolves every recorded spelling to the same id', () {
      final mismatches = <String>[];
      resolves.forEach((spelling, expectedId) {
        final actual = resolveState(spelling)?.id;
        if (actual != expectedId) mismatches.add('"$spelling" -> $actual, expected $expectedId');
      });
      expect(mismatches, isEmpty, reason: 'Dart and JavaScript registries disagree:\n${mismatches.join('\n')}');
    });

    test('declines the spellings recorded as unresolvable', () {
      for (final input in doesNotResolve) {
        expect(resolveState(input), isNull, reason: '"$input" should not resolve');
      }
    });

    test('normalizes the way the JavaScript registry does', () {
      expect(normalizeStateKey('Tamil Nadu'), 'tamil-nadu');
      expect(normalizeStateKey('TAMIL-NADU'), 'tamil-nadu');
      expect(normalizeStateKey('tamil_nadu'), 'tamil-nadu');
      expect(normalizeStateKey('Jammu & Kashmir'), 'jammu-and-kashmir');
      expect(normalizeStateKey('  Goa  '), 'goa');
    });
  });
}

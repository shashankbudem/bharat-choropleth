/// Static registry of the 36 current state/UT identities: id, display name, slug.
///
/// This is *metadata only* — no coordinates, no boundary geometry. It exists so
/// `values: {'goa': 6}` can be recognized however the caller spelled it, the
/// same way the React and JavaScript packages recognize it.
///
/// **This is a hand-maintained translation of `packages/js/src/states.ts`.** The
/// two TypeScript packages share that file as a byte-identical copy, checked by a
/// test; Dart cannot, so nothing can diff this against it. What guards it instead
/// is `test/state_resolution_test.dart`, which replays every spelling the
/// JavaScript registry accepts — generated from it into
/// `packages/js/test/state-resolution-cases.json` — and fails if this file
/// resolves any of them differently. Change either registry, regenerate that
/// fixture, and both sides fail until they agree again.
///
/// Kept in sync with `data/generated/current-2019-states/manifest.json`; ids are
/// LGD-derived and match the `districts/{stateId}.topo.json` filenames.
library;

/// One state or union territory's identity.
class StateIdentity {
  const StateIdentity({required this.id, required this.name, required this.slug});

  /// LGD-derived stable id, e.g. `in-cs-30-goa`.
  final String id;

  /// Display name as it appears in the boundary data, e.g. `Jammu & Kashmir`.
  final String name;

  /// Hyphenated slug as it appears in the boundary data, e.g. `jammu-and-kashmir`.
  final String slug;
}

/// The 36 current states and union territories.
const List<StateIdentity> kStates = <StateIdentity>[
  StateIdentity(id: 'in-cs-01-jammu-and-kashmir', name: 'Jammu & Kashmir', slug: 'jammu-and-kashmir'),
  StateIdentity(id: 'in-cs-02-himachal-pradesh', name: 'Himachal Pradesh', slug: 'himachal-pradesh'),
  StateIdentity(id: 'in-cs-03-punjab', name: 'Punjab', slug: 'punjab'),
  StateIdentity(id: 'in-cs-04-chandigarh', name: 'Chandigarh', slug: 'chandigarh'),
  StateIdentity(id: 'in-cs-05-uttarakhand', name: 'Uttarakhand', slug: 'uttarakhand'),
  StateIdentity(id: 'in-cs-06-haryana', name: 'Haryana', slug: 'haryana'),
  StateIdentity(id: 'in-cs-07-delhi', name: 'Delhi', slug: 'delhi'),
  StateIdentity(id: 'in-cs-08-rajasthan', name: 'Rajasthan', slug: 'rajasthan'),
  StateIdentity(id: 'in-cs-09-uttar-pradesh', name: 'Uttar Pradesh', slug: 'uttar-pradesh'),
  StateIdentity(id: 'in-cs-10-bihar', name: 'Bihar', slug: 'bihar'),
  StateIdentity(id: 'in-cs-11-sikkim', name: 'Sikkim', slug: 'sikkim'),
  StateIdentity(id: 'in-cs-12-arunachal-pradesh', name: 'Arunachal Pradesh', slug: 'arunachal-pradesh'),
  StateIdentity(id: 'in-cs-13-nagaland', name: 'Nagaland', slug: 'nagaland'),
  StateIdentity(id: 'in-cs-14-manipur', name: 'Manipur', slug: 'manipur'),
  StateIdentity(id: 'in-cs-15-mizoram', name: 'Mizoram', slug: 'mizoram'),
  StateIdentity(id: 'in-cs-16-tripura', name: 'Tripura', slug: 'tripura'),
  StateIdentity(id: 'in-cs-17-meghalaya', name: 'Meghalaya', slug: 'meghalaya'),
  StateIdentity(id: 'in-cs-18-assam', name: 'Assam', slug: 'assam'),
  StateIdentity(id: 'in-cs-19-west-bengal', name: 'West Bengal', slug: 'west-bengal'),
  StateIdentity(id: 'in-cs-20-jharkhand', name: 'Jharkhand', slug: 'jharkhand'),
  StateIdentity(id: 'in-cs-21-odisha', name: 'Odisha', slug: 'odisha'),
  StateIdentity(id: 'in-cs-22-chhattisgarh', name: 'Chhattisgarh', slug: 'chhattisgarh'),
  StateIdentity(id: 'in-cs-23-madhya-pradesh', name: 'Madhya Pradesh', slug: 'madhya-pradesh'),
  StateIdentity(id: 'in-cs-24-gujarat', name: 'Gujarat', slug: 'gujarat'),
  StateIdentity(id: 'in-cs-26-dadra-and-nagar-haveli-and-daman-and-diu', name: 'Dadra and Nagar Haveli and Daman and Diu', slug: 'dadra-and-nagar-haveli-and-daman-and-diu'),
  StateIdentity(id: 'in-cs-27-maharashtra', name: 'Maharashtra', slug: 'maharashtra'),
  StateIdentity(id: 'in-cs-28-andhra-pradesh', name: 'Andhra Pradesh', slug: 'andhra-pradesh'),
  StateIdentity(id: 'in-cs-29-karnataka', name: 'Karnataka', slug: 'karnataka'),
  StateIdentity(id: 'in-cs-30-goa', name: 'Goa', slug: 'goa'),
  StateIdentity(id: 'in-cs-31-lakshadweep', name: 'Lakshadweep', slug: 'lakshadweep'),
  StateIdentity(id: 'in-cs-32-kerala', name: 'Kerala', slug: 'kerala'),
  StateIdentity(id: 'in-cs-33-tamil-nadu', name: 'Tamil Nadu', slug: 'tamil-nadu'),
  StateIdentity(id: 'in-cs-34-puducherry', name: 'Puducherry', slug: 'puducherry'),
  StateIdentity(id: 'in-cs-35-andaman-and-nicobar', name: 'Andaman & Nicobar', slug: 'andaman-and-nicobar'),
  StateIdentity(id: 'in-cs-36-telangana', name: 'Telangana', slug: 'telangana'),
  StateIdentity(id: 'in-cs-37-ladakh', name: 'Ladakh', slug: 'ladakh'),
];

/// Former / colloquial / commonly-typed names, mapped to the canonical slug.
/// `values: {'Orissa': 4}` should not be a silent typo for someone who learned
/// the older name — it should just work.
const Map<String, String> _aliases = <String, String>{
  'orissa': 'odisha',
  'pondicherry': 'puducherry',
  'uttaranchal': 'uttarakhand',
  'nct-of-delhi': 'delhi',
  'new-delhi': 'delhi',
  'delhi-nct': 'delhi',
  'jammu-kashmir': 'jammu-and-kashmir',
  'j-and-k': 'jammu-and-kashmir',
  'jk': 'jammu-and-kashmir',
  'andaman-nicobar': 'andaman-and-nicobar',
  'andaman-and-nicobar-islands': 'andaman-and-nicobar',
  'dadra-and-nagar-haveli': 'dadra-and-nagar-haveli-and-daman-and-diu',
  'daman-and-diu': 'dadra-and-nagar-haveli-and-daman-and-diu',
  'dnhdd': 'dadra-and-nagar-haveli-and-daman-and-diu',
  'nagar-haveli': 'dadra-and-nagar-haveli-and-daman-and-diu',
};

final RegExp _nonAlphanumeric = RegExp(r'[^a-z0-9]+');
final RegExp _edgeDashes = RegExp(r'^-+|-+$');

/// Canonical key for any caller-supplied spelling: lowercase, `&` to `and`, every
/// run of non-alphanumerics to a single `-`. So `Tamil Nadu`, `tamil_nadu`,
/// `TAMIL-NADU` and `tamil nadu` all collapse to `tamil-nadu`.
String normalizeStateKey(String input) => input
    .toLowerCase()
    .replaceAll('&', ' and ')
    .replaceAll(_nonAlphanumeric, '-')
    .replaceAll(_edgeDashes, '');

/// Separator-free form, so `tamilnadu` / `uttarpradesh` / `westbengal` resolve too.
String _compact(String key) => key.replaceAll('-', '');

final Map<String, StateIdentity> _byKey = <String, StateIdentity>{};
final Map<String, StateIdentity> _byCompact = <String, StateIdentity>{};
var _built = false;

void _build() {
  if (_built) return;
  _built = true;
  for (final state in kStates) {
    for (final key in <String>[state.slug, normalizeStateKey(state.name), state.id]) {
      _byKey.putIfAbsent(key, () => state);
      _byCompact.putIfAbsent(_compact(key), () => state);
    }
  }
  for (final entry in _aliases.entries) {
    final state = _byKey[entry.value];
    if (state == null) continue; // unreachable while _aliases stays in sync with kStates
    _byKey.putIfAbsent(entry.key, () => state);
    _byCompact.putIfAbsent(_compact(entry.key), () => state);
  }
}

/// Resolve any spelling of a state/UT — display name, slug, LGD id, underscore
/// form, alias, or separator-free form — to its canonical identity.
/// Returns null for anything unrecognized, which callers treat as a typo.
StateIdentity? resolveState(String input) {
  _build();
  final key = normalizeStateKey(input);
  return _byKey[key] ?? _byCompact[_compact(key)];
}

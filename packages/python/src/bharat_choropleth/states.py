"""Static registry of the 36 current state/UT identities: id, display name, slug.

This is *metadata only* - no coordinates, no boundary geometry.  It exists so a
caller can key ``values`` by whatever spelling their data already has and still
have it reach the right region, exactly as the React, JavaScript and Flutter
packages do.

**This is a hand-maintained translation of** ``packages/js/src/states.ts``.  The
two TypeScript packages share that file byte-for-byte and a test diffs them;
Python cannot, so nothing can compare this against it directly.  What guards it
instead is ``tests/test_states.py``, which replays every spelling the JavaScript
registry accepts - recorded in ``packages/js/test/state-resolution-cases.json``
- and fails if this module resolves any of them differently.  Change one
registry, regenerate that fixture, and both sides fail until they agree.

Kept in sync with ``data/generated/current-2019-states/manifest.json``; ids are
LGD-derived and match the ``districts/{stateId}.topo.json`` filenames.
"""

from __future__ import annotations

import re
from typing import Dict, NamedTuple, Optional, Tuple


class StateIdentity(NamedTuple):
    """One state or union territory's identity."""

    #: LGD-derived stable id, e.g. ``in-cs-30-goa``.
    id: str
    #: Display name as it appears in the boundary data, e.g. ``Jammu & Kashmir``.
    name: str
    #: Hyphenated slug as it appears in the boundary data, e.g. ``jammu-and-kashmir``.
    slug: str


#: The 36 current states and union territories.
STATES: Tuple[StateIdentity, ...] = (
    StateIdentity("in-cs-01-jammu-and-kashmir", "Jammu & Kashmir", "jammu-and-kashmir"),
    StateIdentity("in-cs-02-himachal-pradesh", "Himachal Pradesh", "himachal-pradesh"),
    StateIdentity("in-cs-03-punjab", "Punjab", "punjab"),
    StateIdentity("in-cs-04-chandigarh", "Chandigarh", "chandigarh"),
    StateIdentity("in-cs-05-uttarakhand", "Uttarakhand", "uttarakhand"),
    StateIdentity("in-cs-06-haryana", "Haryana", "haryana"),
    StateIdentity("in-cs-07-delhi", "Delhi", "delhi"),
    StateIdentity("in-cs-08-rajasthan", "Rajasthan", "rajasthan"),
    StateIdentity("in-cs-09-uttar-pradesh", "Uttar Pradesh", "uttar-pradesh"),
    StateIdentity("in-cs-10-bihar", "Bihar", "bihar"),
    StateIdentity("in-cs-11-sikkim", "Sikkim", "sikkim"),
    StateIdentity("in-cs-12-arunachal-pradesh", "Arunachal Pradesh", "arunachal-pradesh"),
    StateIdentity("in-cs-13-nagaland", "Nagaland", "nagaland"),
    StateIdentity("in-cs-14-manipur", "Manipur", "manipur"),
    StateIdentity("in-cs-15-mizoram", "Mizoram", "mizoram"),
    StateIdentity("in-cs-16-tripura", "Tripura", "tripura"),
    StateIdentity("in-cs-17-meghalaya", "Meghalaya", "meghalaya"),
    StateIdentity("in-cs-18-assam", "Assam", "assam"),
    StateIdentity("in-cs-19-west-bengal", "West Bengal", "west-bengal"),
    StateIdentity("in-cs-20-jharkhand", "Jharkhand", "jharkhand"),
    StateIdentity("in-cs-21-odisha", "Odisha", "odisha"),
    StateIdentity("in-cs-22-chhattisgarh", "Chhattisgarh", "chhattisgarh"),
    StateIdentity("in-cs-23-madhya-pradesh", "Madhya Pradesh", "madhya-pradesh"),
    StateIdentity("in-cs-24-gujarat", "Gujarat", "gujarat"),
    StateIdentity("in-cs-26-dadra-and-nagar-haveli-and-daman-and-diu", "Dadra and Nagar Haveli and Daman and Diu", "dadra-and-nagar-haveli-and-daman-and-diu"),
    StateIdentity("in-cs-27-maharashtra", "Maharashtra", "maharashtra"),
    StateIdentity("in-cs-28-andhra-pradesh", "Andhra Pradesh", "andhra-pradesh"),
    StateIdentity("in-cs-29-karnataka", "Karnataka", "karnataka"),
    StateIdentity("in-cs-30-goa", "Goa", "goa"),
    StateIdentity("in-cs-31-lakshadweep", "Lakshadweep", "lakshadweep"),
    StateIdentity("in-cs-32-kerala", "Kerala", "kerala"),
    StateIdentity("in-cs-33-tamil-nadu", "Tamil Nadu", "tamil-nadu"),
    StateIdentity("in-cs-34-puducherry", "Puducherry", "puducherry"),
    StateIdentity("in-cs-35-andaman-and-nicobar", "Andaman & Nicobar", "andaman-and-nicobar"),
    StateIdentity("in-cs-36-telangana", "Telangana", "telangana"),
    StateIdentity("in-cs-37-ladakh", "Ladakh", "ladakh"),
)

# Former / colloquial / commonly-typed names, mapped to the canonical slug.
# ``values={"Orissa": 4}`` should not be a silent typo for someone who learned
# the older name - it should just work.
_ALIASES: Dict[str, str] = {
    "orissa": "odisha",
    "pondicherry": "puducherry",
    "uttaranchal": "uttarakhand",
    "nct-of-delhi": "delhi",
    "new-delhi": "delhi",
    "delhi-nct": "delhi",
    "jammu-kashmir": "jammu-and-kashmir",
    "j-and-k": "jammu-and-kashmir",
    "jk": "jammu-and-kashmir",
    "andaman-nicobar": "andaman-and-nicobar",
    "andaman-and-nicobar-islands": "andaman-and-nicobar",
    "dadra-and-nagar-haveli": "dadra-and-nagar-haveli-and-daman-and-diu",
    "daman-and-diu": "dadra-and-nagar-haveli-and-daman-and-diu",
    "dnhdd": "dadra-and-nagar-haveli-and-daman-and-diu",
    "nagar-haveli": "dadra-and-nagar-haveli-and-daman-and-diu",
}

_NON_ALPHANUMERIC = re.compile(r"[^a-z0-9]+")
_EDGE_DASHES = re.compile(r"^-+|-+$")


def normalize_state_key(value: str) -> str:
    """Canonical key for any caller-supplied spelling.

    Lowercase, ``&`` to ``and``, every run of non-alphanumerics to a single
    ``-``.  So ``Tamil Nadu``, ``tamil_nadu``, ``TAMIL-NADU`` and ``tamil nadu``
    all collapse to ``tamil-nadu``.
    """
    lowered = value.lower().replace("&", " and ")
    return _EDGE_DASHES.sub("", _NON_ALPHANUMERIC.sub("-", lowered))


def _compact(key: str) -> str:
    """Separator-free form, so ``tamilnadu`` and ``westbengal`` resolve too."""
    return key.replace("-", "")


_BY_KEY: Dict[str, StateIdentity] = {}
_BY_COMPACT: Dict[str, StateIdentity] = {}

for _state in STATES:
    for _key in (_state.slug, normalize_state_key(_state.name), _state.id):
        _BY_KEY.setdefault(_key, _state)
        _BY_COMPACT.setdefault(_compact(_key), _state)

for _alias, _slug in _ALIASES.items():
    _target = _BY_KEY.get(_slug)
    if _target is None:  # pragma: no cover - unreachable while _ALIASES matches STATES
        continue
    _BY_KEY.setdefault(_alias, _target)
    _BY_COMPACT.setdefault(_compact(_alias), _target)


def resolve_state(value: str) -> Optional[StateIdentity]:
    """Resolve any spelling of a state/UT to its canonical identity.

    Display name, slug, LGD id, underscore form, alias, or separator-free form.
    Returns ``None`` for anything unrecognized, which callers treat as a typo.
    """
    key = normalize_state_key(value)
    return _BY_KEY.get(key) or _BY_COMPACT.get(_compact(key))

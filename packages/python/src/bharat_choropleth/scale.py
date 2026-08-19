"""The colour ramp shared by the static renderers."""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Iterable, Optional, Sequence, Tuple

DEFAULT_COLORS = (
    "#d9f1ed",
    "#b9e3dd",
    "#8fd1c8",
    "#5bb9ae",
    "#2f9c90",
    "#147b71",
    "#075b55",
)
EMPTY_COLOR = "#e7edf0"


@dataclass(frozen=True)
class ColorScale:
    """Map finite numeric values to an ordered categorical colour ramp."""

    colors: Tuple[str, ...] = DEFAULT_COLORS
    empty: str = EMPTY_COLOR

    def __post_init__(self) -> None:
        if not self.colors:
            raise ValueError("ColorScale needs at least one color")

    @classmethod
    def fit(
        cls,
        values: Iterable[object],
        *,
        colors: Sequence[str] = DEFAULT_COLORS,
        empty: str = EMPTY_COLOR,
    ) -> "FittedColorScale":
        """Return a scale fitted to all finite values in ``values``."""

        numeric = tuple(_number(value) for value in values)
        valid = tuple(value for value in numeric if value is not None)
        return FittedColorScale(tuple(colors), empty, min(valid) if valid else None, max(valid) if valid else None)

    def color_for(self, value: object, minimum: Optional[float], maximum: Optional[float]) -> str:
        """Get a fill colour; absent/non-finite values always use ``empty``."""

        numeric = _number(value)
        if numeric is None or minimum is None or maximum is None:
            return self.empty
        if len(self.colors) == 1 or minimum == maximum:
            return self.colors[-1]
        relative = (numeric - minimum) / (maximum - minimum)
        index = round(relative * (len(self.colors) - 1))
        return self.colors[max(0, min(len(self.colors) - 1, index))]


@dataclass(frozen=True)
class FittedColorScale(ColorScale):
    """A :class:`ColorScale` together with its observed numeric range."""

    minimum: Optional[float] = None
    maximum: Optional[float] = None

    def color_for_value(self, value: object) -> str:
        return self.color_for(value, self.minimum, self.maximum)


def numeric_value(value: object) -> Optional[float]:
    """Return a finite float, or ``None`` for missing/non-numeric values."""

    return _number(value)


def _number(value: object) -> Optional[float]:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return number if isfinite(number) else None

import { useCallback, useEffect, useState } from "react";

/**
 * A value the host may control, or leave to the component.
 *
 * The uncontrolled slot follows the controlled value while one is supplied. It
 * used to sit untouched — `setValue` no-ops while controlled — so a host that
 * stopped controlling the prop got whatever the slot held before control began,
 * often many interactions stale, rather than what was on screen a moment ago.
 */
export function useControllableState<T>(controlled: T | undefined, initial: T) {
  const [uncontrolled, setUncontrolled] = useState<T>(initial);
  const value = controlled === undefined ? uncontrolled : controlled;
  useEffect(() => {
    if (controlled !== undefined) setUncontrolled(controlled);
  }, [controlled]);
  const setValue = useCallback((next: T) => {
    if (controlled === undefined) setUncontrolled(next);
  }, [controlled]);
  return [value, setValue] as const;
}

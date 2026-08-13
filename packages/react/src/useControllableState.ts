import { useCallback, useState } from "react";

export function useControllableState<T>(controlled: T | undefined, initial: T) {
  const [uncontrolled, setUncontrolled] = useState<T>(initial);
  const value = controlled === undefined ? uncontrolled : controlled;
  const setValue = useCallback((next: T) => {
    if (controlled === undefined) setUncontrolled(next);
  }, [controlled]);
  return [value, setValue] as const;
}

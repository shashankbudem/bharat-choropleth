import { describe, expect, it } from "vitest";
import cases from "./state-resolution-cases.json";
import { STATES, resolveState } from "../src/states";

/**
 * The fixture is this registry's own output, recorded so the Flutter package can
 * be held to it — `packages/flutter/lib/src/states.dart` is a translation, and
 * nothing can diff Dart against TypeScript.
 *
 * This half asserts the recording is still accurate. Change the registry without
 * regenerating, and this fails with the instruction; the Dart test then fails too
 * until it matches. Regenerate with:
 *
 *     pnpm --filter bharat-choropleth-js build
 *     node scripts/generate-state-resolution-cases.mjs
 */
describe("state resolution cases (shared with the Flutter package)", () => {
  it("covers every state in the registry", () => {
    expect(cases.states).toBe(STATES.length);
  });

  it("still resolves exactly as recorded", () => {
    const actual = Object.fromEntries(
      Object.keys(cases.resolves).map((spelling) => [spelling, resolveState(spelling)?.id]),
    );
    expect(actual).toEqual(cases.resolves);
  });

  it("still declines the spellings recorded as unresolvable", () => {
    for (const input of cases.doesNotResolve) {
      expect(resolveState(input), `${JSON.stringify(input)} should not resolve`).toBeUndefined();
    }
  });
});

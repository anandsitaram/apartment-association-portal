import { describe, expect, it } from "vitest";
import { settingsBody } from "../server/validate.js";

describe("Is Blocks settings persistence", () => {
  it("preserves true when settings are validated for saving", () => {
    expect(settingsBody({ isBlocks: true }).isBlocks).toBe(true);
  });

  it("keeps normal billing as the default when Is Blocks is absent or false", () => {
    expect(settingsBody({}).isBlocks).toBe(false);
    expect(settingsBody({ isBlocks: false }).isBlocks).toBe(false);
  });
});

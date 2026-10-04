// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readBrowserStorage,
  removeBrowserStorage,
  writeBrowserStorage,
} from "../src/safe-storage.js";
import {
  clearSession,
  readSession,
  writeSession,
} from "../src/session-storage.js";

const localDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
const sessionDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "sessionStorage",
);

afterEach(() => {
  vi.restoreAllMocks();
  if (localDescriptor)
    Object.defineProperty(window, "localStorage", localDescriptor);
  else Reflect.deleteProperty(window, "localStorage");
  if (sessionDescriptor)
    Object.defineProperty(window, "sessionStorage", sessionDescriptor);
  else Reflect.deleteProperty(window, "sessionStorage");
});

describe("restricted browser storage", () => {
  it("treats localStorage SecurityError as unavailable instead of crashing the app", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Access denied", "SecurityError");
      },
    });
    expect(readBrowserStorage("rv_section")).toBeNull();
    expect(writeBrowserStorage("rv_section", "dashboard")).toBe(false);
    expect(removeBrowserStorage("rv_section")).toBe(false);
  });

  it("fails closed for stored sessions while keeping storage operations non-throwing", async () => {
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new DOMException("Access denied", "SecurityError");
      },
    });
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Access denied", "SecurityError");
      },
    });
    await expect(readSession()).resolves.toBeNull();
    await expect(
      writeSession(JSON.stringify({ token: "test" })),
    ).resolves.toBeUndefined();
    await expect(clearSession()).resolves.toBeUndefined();
  });

  it("still uses sessionStorage when it is available", async () => {
    window.sessionStorage.setItem(
      "rv_auth",
      JSON.stringify({ token: "session-token" }),
    );
    await expect(readSession()).resolves.toBe(
      JSON.stringify({ token: "session-token" }),
    );
    await clearSession();
    expect(window.sessionStorage.getItem("rv_auth")).toBeNull();
  });
});

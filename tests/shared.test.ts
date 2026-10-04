import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { n2, inr, inr0, monthLabel } from "../shared/format.js";
import { payStatus, flatDues, monthTotals } from "../shared/dues.js";
import {
  availablePages,
  effectiveRole,
  isAdminRole,
  isSuperRole,
} from "../shared/roles.js";
import { createApiClient, isAuthError } from "../shared/api-client.js";
import { maintOf } from "../shared/lib.js";
import { snapshotOf as serverSnapshot } from "../server/calculations.js";

describe("shared/format: same output as the browser's en-IN formatting", () => {
  const values = [
    0,
    1,
    9.5,
    99.999,
    999,
    1000,
    12345.678,
    100000,
    1234567.5,
    -1500,
    -0.001,
    98765432.1,
    "42",
    null,
    undefined,
    "abc",
  ];
  it.each(values)("n2(%s)", (v) => {
    const want = (Number(v) || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    expect(n2(v as any)).toBe(want);
  });
  it("formats rupees and month labels", () => {
    expect(inr(100000)).toBe("₹1,00,000.00");
    expect(inr0(1234.6)).toBe("₹1,235");
    expect(monthLabel("2026-09")).toBe("Sep 2026");
  });
});

describe("shared/dues: one payment-status rule", () => {
  it("excluded > paid > unpaid, with half a paisa of slack", () => {
    expect(payStatus(1000, 1000)).toBe("paid");
    expect(payStatus(1000, 999.996)).toBe("paid");
    expect(payStatus(1000, 999)).toBe("unpaid");
    expect(payStatus(1000, 400)).toBe("unpaid"); // no "part paid" state
    expect(payStatus(0, 0)).toBe("unpaid");
    expect(payStatus(1000, 1000, true)).toBe("excluded");
  });
  it("flatDues / monthTotals use the same maintOf as the web app", () => {
    const month: any = {
      month: "2026-09",
      expenses: [{ description: "x", amount: 5000 }],
      method: "divide",
      value: 10,
      rounding: "nearest",
    };
    const flats: any[] = [
      { flat: "A", bua: 1000 },
      { flat: "B", bua: 1000 },
    ];
    expect(flatDues(month, flats[0], undefined, false).due).toBe(
      maintOf(month, flats[0]),
    );
    const t = monthTotals(
      month,
      flats,
      [{ month: "2026-09", flat: "A", maint: 500, corp: 0 } as any],
      false,
    );
    expect(t).toMatchObject({
      due: 1000,
      paid: 500,
      outstanding: 500,
      unpaidFlats: 1,
    });
  });
});

describe("shared/roles", () => {
  it("normalises roles", () => {
    expect(isAdminRole("super")).toBe(true);
    expect(isSuperRole("admin")).toBe(false);
    expect(effectiveRole("super")).toBe("superadmin");
    expect(effectiveRole(undefined)).toBe("public");
  });
  it("a client can restrict the list to the pages it implements", () => {
    const all = availablePages("admin").map((p) => p.id);
    const some = availablePages("admin", null, ["dashboard", "months"]).map(
      (p) => p.id,
    );
    expect(some).toEqual(
      all.filter((id) => id === "dashboard" || id === "months"),
    );
  });
});

describe("shared/api-client", () => {
  const ok = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });
  it("builds the URL from the configured base and sends the same headers on every client", async () => {
    const f = vi.fn().mockImplementation(async () => ok({ ok: true }));
    vi.stubGlobal("fetch", f);
    await createApiClient({ getBaseUrl: () => "https://x.example" }).call(
      null,
      "tok",
      "months",
      "2026-09",
    );
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://x.example/api/app");
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer tok",
      "X-RV-Screen": "months",
      "X-RV-Month": "2026-09",
    });
    await createApiClient({ getBaseUrl: () => "" }).call({ action: "a" });
    expect(f.mock.calls[1][0]).toBe("/api/app");
    expect(f.mock.calls[1][1].method).toBe("POST");
    vi.unstubAllGlobals();
  });
  it("flags auth errors and friendly network errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async () =>
          ok({ error: "Login required", authRequired: true }, 401),
        ),
    );
    const err = await createApiClient({ getBaseUrl: () => "" })
      .call()
      .catch((e) => e);
    expect(isAuthError(err)).toBe(true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(
      createApiClient({ getBaseUrl: () => "" }).call(),
    ).rejects.toThrow(/Could not reach the server/);
    vi.unstubAllGlobals();
  });
});

describe("the server snapshot is the shared calculation", () => {
  it("matches shared snapshotOf except for the stored description cut-off", () => {
    const m: any = {
      month: "2026-10",
      expenses: [{ description: "e".repeat(80), amount: 90000 }],
      method: "divide",
      value: 28,
      rounding: "up",
    };
    const s = serverSnapshot(
      "2026-10",
      m,
      [{ flat: "A", bua: 1700 } as any],
      [],
    );
    expect(s.due.A).toBe(Math.ceil(90000 / 28));
    expect(s.expenses[0].description).toHaveLength(60);
  });
});

describe("shared/ stays portable", () => {
  it("imports nothing but other shared modules (it is bundled by Vite, Node and Metro)", () => {
    for (const f of readdirSync("shared").filter((n) => n.endsWith(".ts"))) {
      const src = readFileSync(`shared/${f}`, "utf8");
      for (const m of src.matchAll(/from\s+"([^"]+)"/g))
        expect(m[1], `${f} imports ${m[1]}`).toMatch(/^\.\//);
    }
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index.js";

const event = {
  date: "January 12 (Mon)",
  semester: "2",
  year: "2026",
  category: "Classes",
  event: "First day of classes",
};

describe("calendar cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refreshes stale cached calendar data", async () => {
    const stalePayload = {
      cachedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      data: [],
    };
    const cache = {
      get: vi.fn().mockResolvedValue({
        text: () => Promise.resolve(JSON.stringify(stalePayload)),
      }),
      put: vi.fn().mockResolvedValue(undefined),
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [event] }), {
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://example.com/202602"),
      { CALENDAR_CACHE: cache },
      {}
    );
    const calendar = await response.text();

    expect(response.status).toBe(200);
    expect(calendar).toContain("SUMMARY:First day of classes");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(cache.put).toHaveBeenCalledOnce();
  });
});

/**
 * Explicit live verification of the APP'S OWN reader code against the
 * real Mezo mainnet. Excluded from `npm test` (vitest only picks up
 * *.test.ts) because it requires network access; run it directly with:
 *   npx vitest run src/lib/mezo/live.e2e.check.ts
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_MEZO_NETWORK } from "./verified";
import { createMezoClient } from "./client";
import { fetchBtcUsdPrice } from "./oracle";
import { fetchLiveTrove, liveTroveToPositionInput, totalDebtWei } from "./live-position";

const REAL_BORROWER = "0x593c427d8C7bf5C555Ed41cd7CB7cCe8C9F15bB5";

describe("live mainnet reads through the app's own code", () => {
  it("reads a fresh BTC/USD price with chain-id verification", async () => {
    const client = createMezoClient(DEFAULT_MEZO_NETWORK);
    const reading = await fetchBtcUsdPrice(DEFAULT_MEZO_NETWORK, client);
    expect(reading.kind).toBe("ok");
    if (reading.kind !== "ok") throw new Error(reading.message);
    expect(reading.priceUsd).toBeGreaterThan(0);
    expect(reading.chainId).toBe(31612);
    // Rounds are milliseconds fresh — the Skip feed updates every block.
    expect(reading.stale).toBe(false);
    expect(reading.updatedAtMs).toBeGreaterThan(0);
  });

  it("reads the real active trove end-to-end", async () => {
    const client = createMezoClient(DEFAULT_MEZO_NETWORK);
    const [trove, oracleNow] = await Promise.all([
      fetchLiveTrove(DEFAULT_MEZO_NETWORK, client, REAL_BORROWER),
      fetchBtcUsdPrice(DEFAULT_MEZO_NETWORK, client),
    ]);
    expect(trove.kind).toBe("active");
    expect(oracleNow.kind).toBe("ok");
    if (trove.kind !== "active" || oracleNow.kind !== "ok") return;
    const input = liveTroveToPositionInput(trove.amounts, oracleNow.priceUsd);
    expect(input).not.toBeNull();
    if (!input) return;
    expect(input.btcCollateral).toBeGreaterThan(0);
    expect(input.musdDebt).toBeGreaterThan(0);
    expect(totalDebtWei(trove.amounts)).toBeGreaterThan(0n);
  });

  it("reports a virgin address as having no position (not an error)", async () => {
    const client = createMezoClient(DEFAULT_MEZO_NETWORK);
    const reading = await fetchLiveTrove(
      DEFAULT_MEZO_NETWORK,
      client,
      "0x1111111111111111111111111111111111111111",
    );
    expect(reading.kind).toBe("empty");
  });
});

/**
 * DROPTEST — live Mezo mainnet verification script.
 *
 * Not part of the app build. Run with:
 *   node scripts/mezo-live-check.mjs
 *
 * Verifies every contract method DROPTEST uses against the live chain,
 * including a real borrower trove discovered from TroveOwners, so
 * nothing in the integration rests on documentation alone.
 */
import { createPublicClient, defineChain, http, parseAbi, getFunctionSelector } from "viem";

const chain = defineChain({
  id: 31612,
  name: "Mezo Mainnet",
  nativeCurrency: { name: "BTC", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://mezo-mainnet.boar.network"] } },
  blockExplorers: { default: { name: "Mezo Explorer", url: "https://explorer.mezo.org" } },
});

const AGG = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
]);
const PRICEFEED = parseAbi([
  "function oracle() view returns (address)",
  "function TARGET_DIGITS() view returns (uint8)",
  "function fetchPrice() view returns (uint256)",
]);
const TROVE_MANAGER = parseAbi([
  "function getEntireDebtAndColl(address _borrower) view returns (uint256 coll, uint256 principal, uint256 interest, uint256 pendingCollateral, uint256 pendingPrincipal, uint256 pendingInterest)",
  "function getTroveStatus(address _borrower) view returns (uint8)",
  "function getTroveDebt(address _borrower) view returns (uint256)",
  "function getTroveColl(address _borrower) view returns (uint256)",
  "function getNominalICR(address _borrower) view returns (uint256)",
  "function getTroveOwnersCount() view returns (uint256)",
  "function getTroveFromTroveOwnersArray(uint256 _index) view returns (address)",
  "function MCR() view returns (uint256)",
]);
const MUSDTOKEN = parseAbi([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);
const ZERO = "0x0000000000000000000000000000000000000000";
const ADDRESSES = {
  aggregator: "0x7b7c000000000000000000000000000000000015",
  priceFeed: "0xc5aC5A8892230E0A3e1c473881A2de7353fFcA88",
  troveManager: "0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193",
  musd: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186",
};

const client = createPublicClient({ chain, transport: http(ADDRESSES.rpc ?? chain.rpcUrls.default.http[0], { timeout: 30_000 }) });
async function tryRead(label, fn) {
  try {
    const v = await fn();
    return v;
  } catch (err) {
    return `<FAILED: ${String(err.message ?? err).slice(0, 160)}>`;
  }
}

const chainId = await client.getChainId();
console.log("chainId:", chainId, "(expect 31612:", chainId === 31612, ")");
console.log("blockNumber:", await client.getBlockNumber());

const aggDecimals = await tryRead("agg.decimals", () => client.readContract({ address: ADDRESSES.aggregator, abi: AGG, functionName: "decimals" }));
console.log("Skip aggregator decimals():", typeof aggDecimals === "object" ? aggDecimals : aggDecimals);

const aggRound = await tryRead("agg.latestRoundData", () => client.readContract({ address: ADDRESSES.aggregator, abi: AGG, functionName: "latestRoundData" }));
if (Array.isArray(aggRound) || typeof aggRound === "object") {
  const [roundId, answer, , updatedAt] = aggRound.result ?? aggRound;
  console.log("Skip latestRoundData(): roundId", roundId?.toString(), "answer", answer?.toString(), "updatedAt", updatedAt?.toString(), new Date(Number(updatedAt) * 1000).toISOString());
  if (typeof aggDecimals === "number") {
    console.log("  implied BTC/USD price:", Number(answer) / 10 ** Number(aggDecimals));
  }
} else {
  console.log("Skip latestRoundData():", aggRound);
}

const pfOracle = await tryRead("priceFeed.oracle()", () => client.readContract({ address: ADDRESSES.priceFeed, abi: PRICEFEED, functionName: "oracle" }));
console.log("PriceFeed oracle():", pfOracle, "== aggregator:", pfOracle?.toLowerCase?.() === ADDRESSES.aggregator.toLowerCase());

const pfDigits = await tryRead("priceFeed.TARGET_DIGITS()", () => client.readContract({ address: ADDRESSES.priceFeed, abi: PRICEFEED, functionName: "TARGET_DIGITS" }));
console.log("PriceFeed TARGET_DIGITS():", pfDigits?.toString?.());

const pfPrice = await tryRead("priceFeed.fetchPrice()", () => client.readContract({ address: ADDRESSES.priceFeed, abi: PRICEFEED, functionName: "fetchPrice" }));
console.log("PriceFeed fetchPrice() (18-digit):", pfPrice?.toString?.(), typeof pfPrice === "bigint" ? Number(pfPrice) / 1e18 : "");

const musdSymbol = await tryRead("musd.symbol", () => client.readContract({ address: ADDRESSES.musd, abi: MUSDTOKEN, functionName: "symbol" }));
const musdDecimals = await tryRead("musd.decimals", () => client.readContract({ address: ADDRESSES.musd, abi: MUSDTOKEN, functionName: "decimals" }));
console.log("MUSD symbol/decimals:", musdSymbol, musdDecimals);

const mcr = await tryRead("TroveManager.MCR()", () => client.readContract({ address: ADDRESSES.troveManager, abi: TROVE_MANAGER, functionName: "MCR" }));
console.log("TroveManager MCR():", mcr?.toString?.(), typeof mcr === "bigint" ? `(= ${(Number(mcr) / 1e18) * 100}% of debt)` : "");

const ownerCount = await tryRead("TroveManager.getTroveOwnersCount()", () => client.readContract({ address: ADDRESSES.troveManager, abi: TROVE_MANAGER, functionName: "getTroveOwnersCount" }));
console.log("TroveManager getTroveOwnersCount():", ownerCount?.toString?.());

if (typeof ownerCount === "bigint" && ownerCount > 0n) {
  const first = await tryRead("getTroveFromTroveOwnersArray(0)", () => client.readContract({ address: ADDRESSES.troveManager, abi: TROVE_MANAGER, functionName: "getTroveFromTroveOwnersArray", args: [0n] }));
  const lastIdx = ownerCount - 1n;
  const last = await tryRead("getTroveFromTroveOwnersArray(last)", () => client.readContract({ address: ADDRESSES.troveManager, abi: TROVE_MANAGER, functionName: "getTroveFromTroveOwnersArray", args: [lastIdx] }));
  console.log("borrower[0]:", first, " borrower[last]:", last);
  for (const [label, borrower] of [["first", first], ["last", last]]) {
    if (typeof borrower !== "string" || !borrower.startsWith("0x")) continue;
    const status = await tryRead("status", () => client.readContract({ address: ADDRESSES.troveManager, abi: TROVE_MANAGER, functionName: "getTroveStatus", args: [borrower] }));
    const entire = await tryRead("entire", () => client.readContract({ address: ADDRESSES.troveManager, abi: TROVE_MANAGER, functionName: "getEntireDebtAndColl", args: [borrower] }));
    const debtGetter = await tryRead("getTroveDebt", () => client.readContract({ address: ADDRESSES.troveManager, abi: TROVE_MANAGER, functionName: "getTroveDebt", args: [borrower] }));
    const collGetter = await tryRead("getTroveColl", () => client.readContract({ address: ADDRESSES.troveManager, abi: TROVE_MANAGER, functionName: "getTroveColl", args: [borrower] }));
    const nicr = await tryRead("getNominalICR", () => client.readContract({ address: ADDRESSES.troveManager, abi: TROVE_MANAGER, functionName: "getNominalICR", args: [borrower] }));
    console.log(`--- borrower[${label}] ${borrower} status=${status?.toString?.()}`);
    if (Array.isArray(entire?.result ?? entire)) {
      const r = entire.result ?? entire;
      const [coll, principal, interest, pendingColl, pendingPrincipal, pendingInterest] = r.map((x) => x.toString());
      console.log("  getEntireDebtAndColl:", { coll, principal, interest, pendingCollateral: pendingColl, pendingPrincipal, pendingInterest });
      console.log("  totalDebt = principal + interest:", (BigInt(principal) + BigInt(interest)).toString());
      console.log("  getTroveDebt:", debtGetter?.toString?.(), " getTroveColl:", collGetter?.toString?.(), " getNominalICR:", nicr === ZERO ? "ZERO" : nicr?.toString?.());
    } else {
      console.log("  getEntireDebtAndColl:", entire);
    }
  }
}

// Empty-address control: random-looking undefined borrower.
const nobody = "0x1111111111111111111111111111111111111111";
const emptyStatus = await tryRead("empty status", () => client.readContract({ address: ADDRESSES.troveManager, abi: TROVE_MANAGER, functionName: "getTroveStatus", args: [nobody] }));
const emptyEntire = await tryRead("empty entire", () => client.readContract({ address: ADDRESSES.troveManager, abi: TROVE_MANAGER, functionName: "getEntireDebtAndColl", args: [nobody] }));
console.log("empty borrower status (0 = nonExistent):", emptyStatus?.toString?.());
console.log("empty borrower getEntireDebtAndColl:", Array.isArray(emptyEntire?.result ?? emptyEntire) ? (emptyEntire.result ?? emptyEntire).map((x) => x.toString()) : emptyEntire);

console.log("selector sanity:", getFunctionSelector("getEntireDebtAndColl(address)"), getFunctionSelector("Troves(address)"));

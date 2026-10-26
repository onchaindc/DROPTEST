import { createPublicClient, defineChain, http, parseAbi } from "viem";

const chain = defineChain({
  id: 31612,
  name: "Mezo Mainnet",
  nativeCurrency: { name: "BTC", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://mezo-mainnet.boar.network"] } },
  blockExplorers: { default: { name: "Mezo Explorer", url: "https://explorer.mezo.org" } },
});

const TROVE_MANAGER = parseAbi([
  "function Troves(address) view returns (uint256 coll, uint256 principal, uint256 interestOwed, uint256 stake, uint8 status, uint256 interestRate, uint256 lastInterestUpdateTime, uint256 maxBorrowingCapacity, uint128 arrayIndex)",
  "function getNominalICR(address) view returns (uint256)",
]);

const client = createPublicClient({ chain, transport: http("https://mezo-mainnet.boar.network") });
const borrower = "0x593c427d8C7bf5C555Ed41cd7CB7cCe8C9F15bB5"; // last trove

const t = await client.readContract({ address: "0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193", abi: TROVE_MANAGER, functionName: "Troves", args: [borrower] });
console.log("Troves(address):", t);
console.log("interestRate (raw uint256):", t[5].toString(), "(expect bps: e.g. ~1500 ≈ 15%?)");

const nicr = await client.readContract({ address: "0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193", abi: TROVE_MANAGER, functionName: "getNominalICR", args: [borrower] });
console.log("getNominalICR scaled (x1e18):", Number(nicr) / 1e18);

const empty = await client.readContract({ address: "0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193", abi: TROVE_MANAGER, functionName: "Troves", args: ["0x1111111111111111111111111111111111111111"] });
console.log("Troves(empty):", empty.map((x) => x.toString()));

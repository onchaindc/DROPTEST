/**
 * Documented Mezo MUSD fee schedule, and the cost math derived from it.
 *
 * Every constant below is quoted from official Mezo documentation. The
 * docs are the only source of these numbers: nothing here is inferred
 * from chain state, and nothing is invented when the docs are silent.
 *
 * Sources:
 * - Fee summary and distribution: https://mezo.org/docs/users/musd/fees
 *   (also https://mezo.org/docs/users/borrow/fees)
 * - Redemption mechanics: https://mezo.org/docs/developers/musd/musd-redemptions
 *
 * Two documentation conflicts are surfaced rather than silently
 * resolved:
 * - The refinance fee is listed as 0.02% on the developer docs and 0.1%
 *   on the user-facing fee page. Both are kept in DOC_CONFLICTS.
 * - The issuance fee is described as "paid in MUSD", which could mean
 *   paid out of the borrowed amount or capitalised into debt. Both
 *   readings are exposed as separate fields instead of picking one.
 */
import type { PositionInput } from "./risk";

export const FEES_SOURCE = "https://mezo.org/docs/users/musd/fees";
export const FEES_SOURCE_ALT = "https://mezo.org/docs/users/borrow/fees";
export const REDEMPTION_MECHANICS_SOURCE =
  "https://mezo.org/docs/developers/musd/musd-redemptions";

/** Issuance fee: 0.1% of borrowed MUSD, charged on open or increase. */
export const ISSUANCE_FEE_PCT = 0.1;
/** Flat 200 MUSD gas deposit at open; the docs say it is returned on close. */
export const GAS_DEPOSIT_MUSD = 200;
/** 0.75% redemption fee, paid by the redeemer (waived for borrowers with a loan). */
export const REDEMPTION_FEE_PCT = 0.75;
/** Refinance fee — the two docs pages disagree (0.02% vs 0.1%). */
export const REFINANCE_FEE_PCT = 0.1;
export const REFINANCE_FEE_PCT_ALT = 0.02;
/** Documented initial fixed-interest range at open. */
export const INTEREST_RATE_MIN_PCT = 1;
export const INTEREST_RATE_MAX_PCT = 5;

export const DOCUMENTED_FEES = [
  {
    id: "issuance",
    label: "Issuance fee",
    value: "0.1% of borrowed MUSD",
    charged: "Opening or increasing a loan",
    source: FEES_SOURCE,
  },
  {
    id: "interest",
    label: "Interest",
    value: "1–5% APR, fixed at open",
    charged: "Accrues on outstanding debt",
    source: FEES_SOURCE,
  },
  {
    id: "redemption",
    label: "Redemption fee",
    value: "0.75% of redeemed value",
    charged: "Exchanging MUSD for BTC (waived for borrowers)",
    source: FEES_SOURCE,
  },
  {
    id: "refinance",
    label: "Refinance fee",
    value: "0.1% of debt (0.02% on the developer docs)",
    charged: "Refinancing to a new rate",
    source: FEES_SOURCE_ALT,
  },
  {
    id: "gas",
    label: "Gas deposit",
    value: "200 MUSD flat",
    charged: "Opening a loan — returned on close",
    source: FEES_SOURCE,
  },
] as const;

export const DOC_CONFLICTS = [
  {
    topic: "Refinance fee",
    first: "0.1% of debt",
    second: "0.02% of debt",
    source: FEES_SOURCE,
    note: "The user fee page and the developer fee page disagree. DROPTEST quotes the user-facing page and discloses the other value.",
  },
] as const;

export interface BorrowCostBreakdown {
  /** MUSD the user asks to borrow. */
  borrowMusd: number;
  /** 0.1% of the borrowed amount, paid in MUSD per the docs. */
  issuanceFeeMusd: number;
  /** MUSD actually received if the fee is paid out of the proceeds. */
  netMusdReceived: number;
  /** Flat 200 MUSD gas deposit locked at open and returned on close. */
  gasDepositMusd: number;
  /** Debt if the issuance fee is capitalised into the loan instead. */
  debtIfFeeCapitalisedMusd: number;
  /** Fee plus locked deposit, as a percent of the borrowed amount. */
  upfrontCostPct: number;
  /** Fee alone as a percent of the borrowed amount (matches the docs). */
  issuanceFeePct: number;
}

/**
 * Cost of a fresh borrow. Returns null for amounts that cannot be a
 * real MUSD borrow (non-finite or non-positive).
 */
export function borrowingCosts(borrowMusd: number): BorrowCostBreakdown | null {
  if (!Number.isFinite(borrowMusd) || borrowMusd <= 0) return null;
  const issuanceFeeMusd = (borrowMusd * ISSUANCE_FEE_PCT) / 100;
  const gasDepositMusd = GAS_DEPOSIT_MUSD;
  return {
    borrowMusd,
    issuanceFeeMusd,
    netMusdReceived: borrowMusd - issuanceFeeMusd,
    gasDepositMusd,
    debtIfFeeCapitalisedMusd: borrowMusd + issuanceFeeMusd,
    upfrontCostPct: ((issuanceFeeMusd + gasDepositMusd) / borrowMusd) * 100,
    issuanceFeePct: ISSUANCE_FEE_PCT,
  };
}

/**
 * MUSD debt added for a debt increase that includes the issuance fee
 * capitalised into the loan: borrow × (1 + fee/100).
 */
export function debtWithIssuanceFee(borrowMusd: number): number | null {
  const costs = borrowingCosts(borrowMusd);
  return costs === null ? null : costs.debtIfFeeCapitalisedMusd;
}

export interface RedemptionImpact {
  /** MUSD burned against this trove. */
  redeemedMusd: number;
  /** BTC removed from the trove at the oracle price (par: 1 MUSD = $1). */
  collateralSoldBtc: number;
  newDebtMusd: number;
  newCollateralBtc: number;
  /** Collateral ratio after the redemption. */
  newRatio: number;
  /** Ratio change in percentage points. */
  ratioChangePct: number;
  /** True when the redemption clears the whole debt. */
  closesPosition: boolean;
}

/**
 * What a redemption against this trove does to it.
 *
 * Per the docs a redemption burns MUSD and removes BTC at the oracle
 * price, starting from the trove with the lowest collateral ratio above
 * 110% and continuing upward. This is therefore a *what-if*: whether
 * this particular trove is chosen depends on the whole system's trove
 * ordering, which the app cannot see from a single position.
 *
 * Mechanics worth noting: at a ratio above 100%, removing equal dollar
 * amounts from collateral and debt *raises* the ratio. The borrower is
 * force-deleveraged at par, which improves their safety but shrinks the
 * position. Below 100% the ratio would fall instead.
 */
export function redemptionImpact(
  input: PositionInput,
  redeemedMusd: number,
): RedemptionImpact | null {
  const { btcCollateral, musdDebt, btcPriceUsd } = input;
  if (
    !Number.isFinite(btcCollateral) ||
    !Number.isFinite(musdDebt) ||
    !Number.isFinite(btcPriceUsd) ||
    !Number.isFinite(redeemedMusd) ||
    btcCollateral <= 0 ||
    musdDebt <= 0 ||
    btcPriceUsd <= 0 ||
    redeemedMusd <= 0
  ) {
    return null;
  }
  const oldRatio = (btcCollateral * btcPriceUsd) / musdDebt;
  const closesPosition = redeemedMusd >= musdDebt;
  const debtBurned = Math.min(redeemedMusd, musdDebt);
  const collateralValueRemoved = debtBurned;
  const collateralSoldBtc = Math.min(
    btcCollateral,
    collateralValueRemoved / btcPriceUsd,
  );
  const newDebtMusd = Math.max(0, musdDebt - debtBurned);
  const newCollateralBtc = Math.max(0, btcCollateral - collateralSoldBtc);
  const newRatio =
    newDebtMusd === 0
      ? Number.POSITIVE_INFINITY
      : (newCollateralBtc * btcPriceUsd) / newDebtMusd;
  return {
    redeemedMusd: debtBurned,
    collateralSoldBtc,
    newDebtMusd,
    newCollateralBtc,
    newRatio,
    ratioChangePct:
      Number.isFinite(newRatio) && Number.isFinite(oldRatio)
        ? (newRatio - oldRatio) * 100
        : Number.NaN,
    closesPosition,
  };
}

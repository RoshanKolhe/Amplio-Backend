import {HttpErrors} from '@loopback/rest';

/**
 * Investment block size rule: every purchase or redemption must be an exact
 * multiple of ₹1 Crore worth of units.
 *
 * minimumUnits = ONE_CRORE / faceValuePerUnit
 *
 * e.g. faceValue ₹1,00,000 → minimumUnits = 100
 *      faceValue ₹50,000   → minimumUnits = 200
 */
const ONE_CRORE = 10_000_000;

/**
 * Derives how many units constitute one ₹1 Crore block for the given face value.
 *
 * Throws 422 if:
 *   - faceValuePerUnit is 0, null, non-finite, or negative
 *   - faceValuePerUnit does not divide evenly into ONE_CRORE
 *     (floating-point tolerance: 1e-9)
 */
export function calculateMinimumUnits(faceValuePerUnit: number): number {
  if (
    !faceValuePerUnit ||
    !Number.isFinite(faceValuePerUnit) ||
    faceValuePerUnit <= 0
  ) {
    throw new HttpErrors.UnprocessableEntity(
      'PTC unit value is invalid or not configured.',
    );
  }

  const rawMinimum = ONE_CRORE / faceValuePerUnit;
  const minimumUnits = Math.round(rawMinimum);

  // Guard: face value must divide evenly into 1 Crore so blocks are whole units.
  // Tolerance absorbs IEEE-754 rounding (e.g. 1e7 / 1e5 = 99.99999... vs 100).
  if (Math.abs(rawMinimum - minimumUnits) > 1e-9) {
    throw new HttpErrors.UnprocessableEntity(
      `PTC face value ₹${faceValuePerUnit} does not produce a whole-number block size. ` +
        `Contact support to configure a valid face value.`,
    );
  }

  return minimumUnits;
}

/**
 * Validates buy quantity against the ₹1 Crore block rule.
 *
 * Rules enforced:
 *   1. requestedUnits >= minimumUnits
 *   2. requestedUnits is an exact multiple of minimumUnits
 *
 * Call this AFTER validatePositiveIntegerUnits() and AFTER ptcParameters are
 * fetched inside the transaction so the face value is always current.
 */
export function validateBuyBlockRules(
  requestedUnits: number,
  faceValuePerUnit: number,
): void {
  const minimumUnits = calculateMinimumUnits(faceValuePerUnit);

  if (requestedUnits < minimumUnits) {
    throw new HttpErrors.UnprocessableEntity(
      `Minimum investment is ${minimumUnits} units ` +
        `(₹1 Crore block at ₹${faceValuePerUnit}/unit).`,
    );
  }

  if (requestedUnits % minimumUnits !== 0) {
    throw new HttpErrors.UnprocessableEntity(
      `Investment quantity must be a multiple of ${minimumUnits} units.`,
    );
  }
}

/**
 * Validates redemption quantity against the ₹1 Crore block rule.
 *
 * Rules enforced:
 *   1. requestedUnits is an exact multiple of minimumUnits
 *      (partial block redemptions are not allowed)
 *
 * Note: there is intentionally no minimum-units lower-bound check for redeem
 * because an investor might hold exactly minimumUnits or any valid multiple,
 * and should always be able to redeem what they hold as long as it aligns.
 */
export function validateRedeemBlockRules(
  requestedUnits: number,
  faceValuePerUnit: number,
): void {
  const minimumUnits = calculateMinimumUnits(faceValuePerUnit);

  if (requestedUnits % minimumUnits !== 0) {
    throw new HttpErrors.UnprocessableEntity(
      `Redemption quantity must be a multiple of ${minimumUnits} units.`,
    );
  }
}

import {expect} from '@loopback/testlab';
import {HttpErrors} from '@loopback/rest';
import {
  calculateMinimumUnits,
  validateBuyBlockRules,
  validateRedeemBlockRules,
} from '../../utils/ptc-block-validation';

// ─── calculateMinimumUnits ────────────────────────────────────────────────────

describe('calculateMinimumUnits', () => {
  // Valid face values
  it('returns 100 for faceValue 100000 (₹1L/unit)', () => {
    expect(calculateMinimumUnits(100_000)).to.equal(100);
  });

  it('returns 200 for faceValue 50000 (₹50k/unit)', () => {
    expect(calculateMinimumUnits(50_000)).to.equal(200);
  });

  it('returns 10 for faceValue 1000000 (₹10L/unit)', () => {
    expect(calculateMinimumUnits(1_000_000)).to.equal(10);
  });

  it('returns 20 for faceValue 500000 (₹5L/unit)', () => {
    expect(calculateMinimumUnits(500_000)).to.equal(20);
  });

  it('returns 40 for faceValue 250000 (₹2.5L/unit)', () => {
    expect(calculateMinimumUnits(250_000)).to.equal(40);
  });

  it('returns 400 for faceValue 25000 (₹25k/unit)', () => {
    expect(calculateMinimumUnits(25_000)).to.equal(400);
  });

  // Edge cases — invalid inputs
  it('throws 422 for faceValue = 0', () => {
    expect(() => calculateMinimumUnits(0)).to.throwError((err: Error) => {
      expect(err).to.be.instanceOf(HttpErrors.UnprocessableEntity);
    });
  });

  it('throws 422 for negative faceValue', () => {
    expect(() => calculateMinimumUnits(-100_000)).to.throwError((err: Error) => {
      expect(err).to.be.instanceOf(HttpErrors.UnprocessableEntity);
    });
  });

  it('throws 422 for faceValue = NaN', () => {
    expect(() => calculateMinimumUnits(NaN)).to.throwError((err: Error) => {
      expect(err).to.be.instanceOf(HttpErrors.UnprocessableEntity);
    });
  });

  it('throws 422 for faceValue = Infinity', () => {
    expect(() => calculateMinimumUnits(Infinity)).to.throwError((err: Error) => {
      expect(err).to.be.instanceOf(HttpErrors.UnprocessableEntity);
    });
  });

  it('throws 422 for null faceValue (cast)', () => {
    // Simulates accidental null from DB
    expect(() => calculateMinimumUnits(null as unknown as number)).to.throwError(
      (err: Error) => {
        expect(err).to.be.instanceOf(HttpErrors.UnprocessableEntity);
      },
    );
  });

  it('throws 422 when division produces non-integer block size', () => {
    // 10_000_000 / 333_333 ≈ 30.000030... — not a whole number
    expect(() => calculateMinimumUnits(333_333)).to.throwError((err: Error) => {
      expect(err).to.be.instanceOf(HttpErrors.UnprocessableEntity);
    });
  });

  it('handles floating-point face values that divide evenly (e.g. 100000.0)', () => {
    // Should not throw — IEEE-754 tolerance absorbs this
    expect(calculateMinimumUnits(100_000.0)).to.equal(100);
  });
});

// ─── validateBuyBlockRules ────────────────────────────────────────────────────

describe('validateBuyBlockRules', () => {
  const faceValue = 100_000; // minimumUnits = 100

  // Valid quantities
  it('passes for exactly minimumUnits (100)', () => {
    expect(() => validateBuyBlockRules(100, faceValue)).not.to.throwError();
  });

  it('passes for 2× minimumUnits (200)', () => {
    expect(() => validateBuyBlockRules(200, faceValue)).not.to.throwError();
  });

  it('passes for 10× minimumUnits (1000)', () => {
    expect(() => validateBuyBlockRules(1000, faceValue)).not.to.throwError();
  });

  // Below minimum
  it('throws 422 when quantity < minimumUnits (50)', () => {
    expect(() => validateBuyBlockRules(50, faceValue)).to.throwError((err: Error) => {
      expect(err).to.be.instanceOf(HttpErrors.UnprocessableEntity);
      expect(err.message).to.match(/Minimum investment/);
    });
  });

  it('throws 422 when quantity = 1 (way below minimum)', () => {
    expect(() => validateBuyBlockRules(1, faceValue)).to.throwError((err: Error) => {
      expect(err).to.be.instanceOf(HttpErrors.UnprocessableEntity);
      expect(err.message).to.match(/Minimum investment/);
    });
  });

  // Not a multiple
  it('throws 422 when quantity = 120 (not a multiple of 100)', () => {
    expect(() => validateBuyBlockRules(120, faceValue)).to.throwError((err: Error) => {
      expect(err).to.be.instanceOf(HttpErrors.UnprocessableEntity);
      expect(err.message).to.match(/multiple of 100/);
    });
  });

  it('throws 422 when quantity = 350 (not a multiple of 100)', () => {
    expect(() => validateBuyBlockRules(350, faceValue)).to.throwError((err: Error) => {
      expect(err).to.be.instanceOf(HttpErrors.UnprocessableEntity);
      expect(err.message).to.match(/multiple of 100/);
    });
  });

  it('throws 422 when quantity = 101 (one above minimum, not a multiple)', () => {
    expect(() => validateBuyBlockRules(101, faceValue)).to.throwError((err: Error) => {
      expect(err).to.be.instanceOf(HttpErrors.UnprocessableEntity);
    });
  });

  // faceValue = 50000, minimumUnits = 200
  describe('with faceValue 50000 (minimumUnits = 200)', () => {
    const fv = 50_000;

    it('passes for 200', () => {
      expect(() => validateBuyBlockRules(200, fv)).not.to.throwError();
    });

    it('passes for 400', () => {
      expect(() => validateBuyBlockRules(400, fv)).not.to.throwError();
    });

    it('throws for 100 (below minimum)', () => {
      expect(() => validateBuyBlockRules(100, fv)).to.throwError((err: Error) => {
        expect(err).to.be.instanceOf(HttpErrors.UnprocessableEntity);
        expect(err.message).to.match(/Minimum investment is 200/);
      });
    });

    it('throws for 250 (not a multiple of 200)', () => {
      expect(() => validateBuyBlockRules(250, fv)).to.throwError((err: Error) => {
        expect(err).to.be.instanceOf(HttpErrors.UnprocessableEntity);
        expect(err.message).to.match(/multiple of 200/);
      });
    });
  });

  // Propagates invalid faceValue error
  it('throws 422 when faceValue is 0', () => {
    expect(() => validateBuyBlockRules(100, 0)).to.throwError((err: Error) => {
      expect(err).to.be.instanceOf(HttpErrors.UnprocessableEntity);
    });
  });
});

// ─── validateRedeemBlockRules ─────────────────────────────────────────────────

describe('validateRedeemBlockRules', () => {
  const faceValue = 100_000; // minimumUnits = 100

  // Valid quantities
  it('passes for exactly minimumUnits (100)', () => {
    expect(() => validateRedeemBlockRules(100, faceValue)).not.to.throwError();
  });

  it('passes for 200 (2× block)', () => {
    expect(() => validateRedeemBlockRules(200, faceValue)).not.to.throwError();
  });

  it('passes for 1000 (10× block)', () => {
    expect(() => validateRedeemBlockRules(1000, faceValue)).not.to.throwError();
  });

  // Invalid quantities (not multiples)
  it('throws 422 when quantity = 50 (partial block)', () => {
    expect(() => validateRedeemBlockRules(50, faceValue)).to.throwError((err: Error) => {
      expect(err).to.be.instanceOf(HttpErrors.UnprocessableEntity);
      expect(err.message).to.match(/Redemption quantity must be a multiple/);
    });
  });

  it('throws 422 when quantity = 150 (not a multiple of 100)', () => {
    expect(() => validateRedeemBlockRules(150, faceValue)).to.throwError((err: Error) => {
      expect(err).to.be.instanceOf(HttpErrors.UnprocessableEntity);
      expect(err.message).to.match(/multiple of 100/);
    });
  });

  it('throws 422 when quantity = 1 (far below minimum block)', () => {
    expect(() => validateRedeemBlockRules(1, faceValue)).to.throwError((err: Error) => {
      expect(err).to.be.instanceOf(HttpErrors.UnprocessableEntity);
    });
  });

  it('throws 422 when quantity = 99 (one below a full block)', () => {
    expect(() => validateRedeemBlockRules(99, faceValue)).to.throwError((err: Error) => {
      expect(err).to.be.instanceOf(HttpErrors.UnprocessableEntity);
    });
  });

  // faceValue = 50000, minimumUnits = 200
  describe('with faceValue 50000 (minimumUnits = 200)', () => {
    const fv = 50_000;

    it('passes for 200', () => {
      expect(() => validateRedeemBlockRules(200, fv)).not.to.throwError();
    });

    it('passes for 600', () => {
      expect(() => validateRedeemBlockRules(600, fv)).not.to.throwError();
    });

    it('throws for 100 (partial block)', () => {
      expect(() => validateRedeemBlockRules(100, fv)).to.throwError((err: Error) => {
        expect(err).to.be.instanceOf(HttpErrors.UnprocessableEntity);
        expect(err.message).to.match(/multiple of 200/);
      });
    });
  });

  // Propagates invalid faceValue error
  it('throws 422 when faceValue is 0', () => {
    expect(() => validateRedeemBlockRules(100, 0)).to.throwError((err: Error) => {
      expect(err).to.be.instanceOf(HttpErrors.UnprocessableEntity);
    });
  });
});

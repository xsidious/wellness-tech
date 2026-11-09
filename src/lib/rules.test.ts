import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAdminOrder, canOrder, commissionCents, fulfillmentGroups } from "./rules";

describe("catalog gates", () => {
  it("stops a Tier 1 account from ordering 503B office stock", () => {
    const result = canOrder(1, "503B", true);
    assert.equal(result.ok, false);
    assert.match(result.reason || "", /Tier 1/);
  });

  it("lets Tier 2 order 503B and Tier 1 order a supply", () => {
    assert.equal(canOrder(2, "503B", true).ok, true);
    assert.equal(canOrder(1, "supply", true).ok, true);
    assert.equal(canOrder(0, "503A", true).ok, false);
  });

  it("keeps exosomes and bulk APIs off checkout", () => {
    assert.equal(canOrder(4, "exosome", false).ok, false);
    assert.equal(canOrder(4, "bulk_api", true).ok, false);
  });

  it("lets admin desk order active SKUs including held classes", () => {
    assert.equal(canAdminOrder(true).ok, true);
    assert.equal(canAdminOrder(false).ok, false);
  });
});

describe("commissions", () => {
  it("pays devices and supplies only", () => {
    assert.equal(commissionCents("supply", 1200), 120);
    assert.equal(commissionCents("device", 8400), 840);
    assert.equal(commissionCents("503A", 18900), 0);
    assert.equal(commissionCents("503B", 6400), 0);
    assert.equal(commissionCents("brand", 5000), 0);
  });
});

describe("checkout split", () => {
  it("explains a mixed cart and still describes one invoice", () => {
    const split = fulfillmentGroups(["503A", "503B", "supply"]);
    assert.equal(split.groups.length, 3);
    assert.match(split.message, /one invoice/);
  });
});

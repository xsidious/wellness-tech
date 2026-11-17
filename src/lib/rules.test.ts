import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAdminOrder, canOrder, commissionCents, fulfillmentGroups } from "./rules";

describe("catalog gates", () => {
  it("lets any orderable SKU through the marketplace", () => {
    assert.equal(canOrder(0, "503A", true).ok, true);
    assert.equal(canOrder(1, "503B", true).ok, true);
    assert.equal(canOrder(4, "exosome", true).ok, true);
    assert.equal(canOrder(4, "bulk_api", true).ok, true);
    assert.equal(canOrder(2, "RND", true).ok, true);
  });

  it("still blocks SKUs marked not orderable", () => {
    assert.equal(canOrder(4, "exosome", false).ok, false);
    assert.equal(canOrder(4, "supply", false).ok, false);
  });

  it("blocks Eventide lines without a VitaRelay UUID", () => {
    assert.equal(
      canOrder(2, "503A", true, { sku: "AA-FOX", category: "Anti-Aging", rxcoreFormularyId: "AA-FOX" }).ok,
      false,
    );
    assert.equal(
      canOrder(2, "503A", true, {
        sku: "ccf77eba-4e8b-4b54-8151-82c12cb66653",
        category: "Eventide · Anti-Aging",
        rxcoreFormularyId: "ccf77eba-4e8b-4b54-8151-82c12cb66653",
      }).ok,
      true,
    );
    assert.equal(
      canOrder(2, "503A", true, {
        sku: "PUSA-GLP1S-1-5",
        category: "PrescribeUSA Pens · GLP-1",
        rxcoreFormularyId: "pusa-pusa-glp1s-1-5",
      }).ok,
      true,
    );
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

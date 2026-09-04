/**
 * Golden-URL snapshot tests for the DoorDash deep-link contract.
 *
 * DO NOT UPDATE EXPECTED STRINGS to make failures pass without
 * explicit DoorDash spec confirmation. Any param name / order /
 * encoding change must fail here by design.
 *
 * Run: node --test src/lib/__tests__/deepLinkBuilder.golden.test.js
 * (also wired to `npm test`)
 *
 * dsd=${Date.now()} is mocked to a fixed value so snapshots are stable.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  AUDIENCE_MAP,
  generateDeepLink,
  generateSmartLink,
  generateLoyaltyLink,
  generateSpendXGetYLink,
  generateBogoLink,
  generateDeliveryFeeLink,
  generateLeanLink,
  buildAllDeepLinks,
} from "../deepLinkBuilder.js";

const FIXED_NOW = 1700000000000;
let realNow;

before(() => {
  realNow = Date.now;
  Date.now = () => FIXED_NOW;
});

after(() => {
  Date.now = realNow;
});

const MERCHANT = {
  id: "m1",
  businessId: "12345",
  storeId: "67890",
  originalSids: "111,222",
};

describe("deepLinkBuilder golden URLs (DoorDash contract)", () => {
  it("Sponsored Listing: cents math + %2C + param order frozen", () => {
    // 14 -> abwv=1400 ($14.00 in cents), abv=floor(14/7)*100=200, bscv=500, bsao=0
    const url = generateDeepLink({
      businessId: "12345",
      sidsArray: ["111", "222"],
      repId: "rep99",
      weeklyBudget: "14",
      audienceKey: "all",
    });
    assert.equal(
      url,
      "https://www.doordash.com/merchant/marketing/sl/create?business_id=12345&aud=all&dsd=1700000000000&sids=111%2C222&assisted_rep_id=rep99&abv=200&abwv=1400&bsao=0&bscv=500&bsia=true&sch_ad=true"
    );
  });

  it("Smart: globals + pt=undefined frozen", () => {
    assert.equal(
      generateSmartLink(MERCHANT, "rep99", {}),
      "https://www.doordash.com/merchant/marketing/smart/create?business_id=12345&sids=111%2C222&assisted_rep_id=rep99&dsd=1700000000000&sch_ad=true&pbv=noBudget&pbwv=noBudget&pbic=false&aud=smart_targeting&pt=undefined&mst=0"
    );
  });

  it("Smart cart-level appends is_smart_bogo=false", () => {
    assert.equal(
      generateSmartLink(MERCHANT, "rep99", { isCartLevel: true }),
      "https://www.doordash.com/merchant/marketing/smart/create?business_id=12345&sids=111%2C222&assisted_rep_id=rep99&dsd=1700000000000&sch_ad=true&pbv=noBudget&pbwv=noBudget&pbic=false&aud=smart_targeting&pt=undefined&mst=0&is_smart_bogo=false"
    );
  });

  it("Loyalty: business_id only (no sids/dsd/rep)", () => {
    assert.equal(
      generateLoyaltyLink(MERCHANT),
      "https://www.doordash.com/merchant/loyalty?business_id=12345"
    );
  });

  it("SpendXGetY percentage: mst/cpo/cmpv cents frozen", () => {
    assert.equal(
      generateSpendXGetYLink(MERCHANT, "rep99", {
        minSubtotal: "20",
        audience: "all",
        discountType: "percentage",
        percentageAmount: "20",
        maxDiscount: "10",
      }),
      "https://www.doordash.com/merchant/marketing/spendxgety/create?business_id=12345&sids=111%2C222&assisted_rep_id=rep99&dsd=1700000000000&sch_ad=true&pbv=noBudget&pbwv=noBudget&pbic=false&aud=all&mst=2000&pt=pdws&cpo=20&cmpv=1000"
    );
  });

  it("SpendXGetY dollar: mst/cfo cents frozen", () => {
    assert.equal(
      generateSpendXGetYLink(MERCHANT, "rep99", {
        minSubtotal: "30",
        audience: "new_to_merchant",
        discountType: "dollar",
        dollarAmount: "6",
      }),
      "https://www.doordash.com/merchant/marketing/spendxgety/create?business_id=12345&sids=111%2C222&assisted_rep_id=rep99&dsd=1700000000000&sch_ad=true&pbv=noBudget&pbwv=noBudget&pbic=false&aud=new_to_merchant&mst=3000&pt=dvdws&cfo=600"
    );
  });

  it("BOGO: pt=undefined + aggregated_item_ids frozen", () => {
    assert.equal(
      generateBogoLink(MERCHANT, "rep99", { audience: "all" }),
      "https://www.doordash.com/merchant/marketing/bogo/create?business_id=12345&sids=111%2C222&assisted_rep_id=rep99&dsd=1700000000000&sch_ad=true&pbv=noBudget&pbwv=noBudget&pbic=false&aud=all&pt=undefined&mst=0&aggregated_item_ids="
    );
  });

  it("Delivery fee: explicit + 2500 default frozen", () => {
    assert.equal(
      generateDeliveryFeeLink(MERCHANT, "rep99", { audience: "all", minSubtotal: "25" }),
      "https://www.doordash.com/merchant/marketing/ddd/create?business_id=12345&sids=111%2C222&assisted_rep_id=rep99&dsd=1700000000000&sch_ad=true&pbv=noBudget&pbwv=noBudget&pbic=false&aud=all&pt=ddws&mst=2500"
    );
    assert.equal(
      generateDeliveryFeeLink(MERCHANT, "rep99", { audience: "all" }),
      "https://www.doordash.com/merchant/marketing/ddd/create?business_id=12345&sids=111%2C222&assisted_rep_id=rep99&dsd=1700000000000&sch_ad=true&pbv=noBudget&pbwv=noBudget&pbic=false&aud=all&pt=ddws&mst=2500"
    );
  });

  it("Lean URLs: business_id only", () => {
    assert.equal(
      generateLeanLink(MERCHANT, "happy_hour"),
      "https://www.doordash.com/merchant/marketing/cx_moment/create?business_id=12345"
    );
    assert.equal(
      generateLeanLink(MERCHANT, "lunch_specials"),
      "https://www.doordash.com/merchant/marketing/lunch_special/create?business_id=12345"
    );
  });

  it("Master builder maps promos per merchant verbatim", () => {
    const links = buildAllDeepLinks([MERCHANT], ["loyalty", "happy_hour"], {}, "rep99");
    assert.deepEqual(links, {
      m1: {
        loyalty: "https://www.doordash.com/merchant/loyalty?business_id=12345",
        happy_hour:
          "https://www.doordash.com/merchant/marketing/cx_moment/create?business_id=12345",
      },
    });
  });

  it("Audience map frozen", () => {
    assert.deepEqual(AUDIENCE_MAP, {
      all: "all",
      new_to_merchant: "new_to_merchant",
      existing_consumers_to_merchant: "existing_consumers_to_merchant",
      churned_users: "churned_users",
      smart_targeting: "smart_targeting",
    });
  });
});

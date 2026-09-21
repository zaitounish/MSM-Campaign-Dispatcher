import { test } from "node:test";
import assert from "node:assert/strict";
import { processSheetData } from "../bobParser.js";
import { transformAssignedLeadsToMerchants } from "../assignedLeadsAdapter.js";

test("bobParser maps and preserves Opp Type from raw sheet rows", () => {
  const mockSheet = [
    ["Store Id", "Business Id", "Merchant Name", "DM Email", "Opp Type", "Promo Opp"],
    ["101", "B-1", "Taco Fiesta 1", "dm1@taco.com", "Net New", "1"],
    ["102", "B-1", "Taco Fiesta 2", "dm2@taco.com", "Net New", "1"],
    ["201", "B-2", "Burger Hub", "owner@burger.com", "Optimization", "1"],
    ["301", "B-3", "Pizza Corner", "chef@pizza.com", "Retention Evergreen", "0"],
    ["401", "B-4", "Sushi Spot", "sushi@spot.com", "Retention Upcoming Churn", "1"],
  ];

  const merchants = processSheetData(mockSheet);

  assert.equal(merchants.length, 4);

  const b1 = merchants.find(m => m.businessId === "B-1");
  assert.ok(b1);
  assert.equal(b1.oppType, "Net New");
  assert.equal(b1.locationCount, 2);

  const b2 = merchants.find(m => m.businessId === "B-2");
  assert.ok(b2);
  assert.equal(b2.oppType, "Optimization");

  const b3 = merchants.find(m => m.businessId === "B-3");
  assert.ok(b3);
  assert.equal(b3.oppType, "Retention Evergreen");

  const b4 = merchants.find(m => m.businessId === "B-4");
  assert.ok(b4);
  assert.equal(b4.oppType, "Retention Upcoming Churn");
});

test("transformAssignedLeadsToMerchants marks merchants as isSpiff with oppType", () => {
  const assignedLeads = [
    {
      store_id: "888",
      business_id: "BIZ-888",
      business_name: "Hot Wings Cafe",
      email: "wings@cafe.com",
      opp_type: "Net New",
    },
    {
      store_id: "999",
      business_id: "BIZ-999",
      business_name: "Pancake Palace",
      email: "pancakes@palace.com",
      opp_type: "Optimization",
    },
  ];

  const merchants = transformAssignedLeadsToMerchants(assignedLeads);
  assert.equal(merchants.length, 2);
  assert.equal(merchants[0].isSpiff, true);
  assert.equal(merchants[0].oppType, "Net New");
  assert.equal(merchants[1].isSpiff, true);
  assert.equal(merchants[1].oppType, "Optimization");
});

/**
 * FE-CODE-14: dead defineEnterpriseOidcCompleteLabels must not be re-exported.
 */
import { expect, it } from "vitest";

import * as builders from "./label-builders";

it("exports the two live label builders", () => {
  expect(typeof builders.defineEnterpriseLoginLabels).toBe("function");
  expect(typeof builders.defineEnterpriseSecurityLabels).toBe("function");
});

it("does not re-export dead defineEnterpriseOidcCompleteLabels (FE-CODE-14)", () => {
  expect("defineEnterpriseOidcCompleteLabels" in builders).toBe(false);
});

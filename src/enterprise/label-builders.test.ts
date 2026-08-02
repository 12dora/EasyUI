/**
 * FE-CODE-14: dead defineEnterpriseOidcCompleteLabels must not be re-exported.
 */
import * as builders from "./label-builders";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(typeof builders.defineEnterpriseLoginLabels === "function", "login builder present");
assert(typeof builders.defineEnterpriseSecurityLabels === "function", "security builder present");
assert(
  !("defineEnterpriseOidcCompleteLabels" in builders),
  "defineEnterpriseOidcCompleteLabels must be removed (FE-CODE-14)",
);

console.log("label-builders.test.ts: ok");

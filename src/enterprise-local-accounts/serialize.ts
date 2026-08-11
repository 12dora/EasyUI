import type { Dayjs } from "dayjs";

/**
 * Form Dayjs → wire-format expiresAt.
 *
 * Always emits a timezone-aware ISO-8601 instant (UTC `Z` via Dayjs#toISOString).
 * Callers must not use local-naive `format('YYYY-MM-DDTHH:mm:ss')`.
 */
export function serializeFormExpiresAt(value: Dayjs): string {
  return value.toISOString();
}

/**
 * CREATE submit mapping for expiresAt.
 * - Dayjs present → include ISO instant
 * - null / undefined / falsy → omit field (permanent account)
 */
export function mapCreateExpiresAt(
  expiresAt: Dayjs | null | undefined,
): { expiresAt: string } | Record<string, never> {
  if (!expiresAt) return {};
  return { expiresAt: serializeFormExpiresAt(expiresAt) };
}

/**
 * Expiry-save PATCH mapping (explicit set or clear; not the "omit = unchanged" case).
 * - Dayjs → ISO instant
 * - null → null (clear / permanent)
 */
export function mapExpiryUpdatePatch(expiresAt: Dayjs | null): { expiresAt: string | null } {
  return { expiresAt: expiresAt ? serializeFormExpiresAt(expiresAt) : null };
}

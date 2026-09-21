import type { ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "ink"
  | "amber"
  | "evergreen"
  | "signal"
  | "pending"
  | "bond"
  | "faint";

const TONE: Record<BadgeTone, string> = {
  neutral: "border-ink/20 text-ink bg-paper-soft",
  faint: "border-ink/10 text-ink-faint bg-paper-deep/60",
  ink: "border-ink/80 text-paper bg-ink",
  amber: "border-[rgb(var(--amber))]/40 text-[rgb(var(--amber))] bg-[rgb(var(--amber))]/[0.08]",
  // Green badge: same fill/`-ink` split as `signal` and `pending`. On this tone's own 8% wash
  // #059669 is 3.42:1 on paper / 3.28:1 on paper-deep and misses AA; #047857 gives 4.98:1 / 4.77:1,
  // clear of the 4.5:1 floor the 12px label needs.
  evergreen:
    "border-[rgb(var(--evergreen))]/40 text-[rgb(var(--evergreen-ink))] bg-[rgb(var(--evergreen))]/[0.08]",
  // Red badge: fill + border keep `--signal`, the label itself goes `--signal-ink` — the
  // status word is text, and it sits on a red-tinted surface where #DC2626 loses contrast.
  signal:
    "border-[rgb(var(--signal))]/40 text-[rgb(var(--signal-ink))] bg-[rgb(var(--signal))]/[0.08]",
  // Amber badge: the real amber lives in the status ramp (`--amber` is the blue primary action),
  // so border + tint take `--status-pending` and the label takes `--status-pending-ink` — same
  // split as `signal`, for the same reason. On this tone's own 8% wash the fill #D97706 measures
  // 2.93:1 on paper / 2.80:1 on paper-deep and fails AA outright; #92400E gives 6.51:1 / 6.24:1,
  // clear of the 4.5:1 floor the 12px label needs.
  pending:
    "border-[rgb(var(--status-pending))]/40 text-[rgb(var(--status-pending-ink))] bg-[rgb(var(--status-pending))]/[0.08]",
  // Indigo needs no `-ink` sibling: #4F46E5 is 5.58:1 on paper / 5.34:1 on paper-deep over its
  // own 8% wash, so the label clears AA on the fill token itself.
  bond:
    "border-[rgb(var(--bond))]/40 text-[rgb(var(--bond))] bg-[rgb(var(--bond))]/[0.08]",
};

/**
 * Status badge. Content is a translated status word ("已启用", "同步失败"), never a code,
 * so it follows the kit's label rules: 12px floor, no `uppercase` (a no-op on CJK, shouting
 * in Latin), no `tracking` (spread glyphs read as separate marks at this size).
 *
 * The `uppercase` prop is gone with the styling it controlled; call sites that opted out
 * with `uppercase={false}` for Chinese labels are now the default and can drop the prop.
 * `leading-4` + `py-0.5` are unchanged, so the pill keeps its 22px box.
 */
export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap border rounded-[2px] px-1.5 py-0.5 font-mono text-[12px] leading-4 ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Map common backend status enums to a badge tone. */
export function statusTone(status: string | null | undefined): BadgeTone {
  if (!status) return "faint";
  const s = status.toUpperCase();
  // Activity-ish positive
  if (["ACTIVE", "PAID", "DELIVERED", "COMPLETED", "ACCEPTED", "CONFIRMED"].includes(s))
    return "evergreen";
  // Caution / in-flight
  if (
    ["PENDING", "DRAFT", "PRODUCTION", "DEPOSIT", "SENT", "REVISED", "SHIPPED", "INVOICED"].includes(
      s,
    )
  )
    return "amber";
  // Terminated
  if (["INACTIVE", "VOIDED", "REJECTED", "EXPIRED", "CANCELLED"].includes(s)) return "signal";
  // Converted / archived
  if (["CONVERTED", "CONVERTED_TO_ORDER", "ISSUED", "ARCHIVED"].includes(s)) return "bond";
  return "neutral";
}

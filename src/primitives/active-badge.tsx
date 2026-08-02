"use client";

import { Badge } from "./badge";

export function ActiveBadge({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return <Badge tone={active ? "evergreen" : "faint"}>{active ? activeLabel : inactiveLabel}</Badge>;
}

export function EnabledBadge({
  enabled,
  enabledLabel,
  disabledLabel,
}: {
  enabled: boolean;
  enabledLabel: string;
  disabledLabel: string;
}) {
  return <Badge tone={enabled ? "evergreen" : "faint"}>{enabled ? enabledLabel : disabledLabel}</Badge>;
}

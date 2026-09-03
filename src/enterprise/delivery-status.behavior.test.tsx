// @vitest-environment happy-dom
/**
 * User risk: a reminder that was merely accepted must never read as delivered,
 * and a message DingTalk swallowed 24h ago must not keep looking fine — the
 * owner has to know to chase it another way.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  EnterpriseDeliveryStatusBadge,
  EnterpriseDeliveryStatusDetail,
  isEnterpriseDeliveryUnconfirmed,
  type EnterpriseDeliveryStatus,
  type EnterpriseDeliveryStatusValue,
} from "./delivery-status";
import { createEnterpriseLabelCatalog } from "./label-catalog";
import { byTestId, mount, type MountedView } from "./behavior-test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const zh = createEnterpriseLabelCatalog("zh-CN", { appName: "测试", appDescription: "测试" }, "business").delivery;
const en = createEnterpriseLabelCatalog("en", { appName: "Test", appDescription: "Test" }, "business").delivery;
const ALL_STATUSES: readonly EnterpriseDeliveryStatus[] = ["queued", "accepted", "sent", "delivered", "failed", "superseded"];
let view: MountedView | null = null;

afterEach(async () => {
  await view?.unmount();
  view = null;
});

describe("EnterpriseDeliveryStatusBadge", () => {
  it("renders the localized label and status marker for every status", async () => {
    for (const labels of [zh, en]) {
      for (const status of ALL_STATUSES) {
        const mounted = await mount(<EnterpriseDeliveryStatusBadge status={status} labels={labels} />);
        const badge = byTestId(mounted.host, "delivery-status-badge");
        expect(badge.dataset.status).toBe(status);
        expect(badge.textContent).toBe(labels.statusLabels[status]);
        await mounted.unmount();
      }
    }
    expect(zh.statusLabels.delivered).toBe("已投递(不代表已读)");
    expect(zh.statusLabels.accepted).toBe("已受理(待发送)");
  });
});

describe("EnterpriseDeliveryStatusDetail", () => {
  const base: EnterpriseDeliveryStatusValue = {
    status: "sent",
    acceptedAt: "2026-09-01T00:00:00Z",
    sentAt: "2026-09-01T00:01:00Z",
    deliveredAt: null,
    lastError: null,
    providerMessageId: "msg-42",
    recipientCount: 1,
    lastReconciledAt: "2026-09-01T00:02:00Z",
  };

  it("explains every status and prints the facts it has", async () => {
    for (const status of ALL_STATUSES) {
      const mounted = await mount(
        <EnterpriseDeliveryStatusDetail value={{ ...base, status }} labels={en} locale="en" now={Date.parse("2026-09-01T00:05:00Z")} />,
      );
      expect(byTestId(mounted.host, "delivery-status-explanation").textContent).toBe(en.statusExplanations[status]);
      expect(byTestId(mounted.host, "delivery-status-message-id").textContent).toBe("msg-42");
      expect(byTestId(mounted.host, "delivery-status-recipient-count").textContent).toBe("1");
      expect(byTestId(mounted.host, "delivery-status-delivered-at").textContent).toBe(en.notAvailable);
      expect(mounted.host.querySelector("[data-test-id='delivery-status-unconfirmed']")).toBeNull();
      await mounted.unmount();
    }
  });

  it("warns once a sent message has gone unconfirmed for more than 24h", async () => {
    const justUnder = Date.parse("2026-09-01T00:01:00Z") + 24 * 60 * 60 * 1000 - 1000;
    view = await mount(<EnterpriseDeliveryStatusDetail value={base} labels={zh} locale="zh-CN" now={justUnder} />);
    expect(view.host.querySelector("[data-test-id='delivery-status-unconfirmed']")).toBeNull();

    await view.rerender(
      <EnterpriseDeliveryStatusDetail value={base} labels={zh} locale="zh-CN" now={justUnder + 2000} />,
    );
    expect(byTestId(view.host, "delivery-status-unconfirmed").textContent).toBe(zh.unconfirmedHint);

    // Only `sent` is ambiguous: a confirmed delivery never shows the hint.
    await view.rerender(
      <EnterpriseDeliveryStatusDetail
        value={{ ...base, status: "delivered", deliveredAt: "2026-09-01T00:03:00Z" }}
        labels={zh}
        locale="zh-CN"
        now={justUnder + 2000}
      />,
    );
    expect(view.host.querySelector("[data-test-id='delivery-status-unconfirmed']")).toBeNull();
  });

  it("shows the last error when the send failed", async () => {
    view = await mount(
      <EnterpriseDeliveryStatusDetail
        value={{ ...base, status: "failed", lastError: "recipient_unmapped" }}
        labels={en}
        locale="en"
      />,
    );
    expect(byTestId(view.host, "delivery-status-error").textContent).toContain("recipient_unmapped");
  });

  it("treats a missing or unparseable sentAt as not-unconfirmed", () => {
    expect(isEnterpriseDeliveryUnconfirmed({ status: "sent" }, Date.now())).toBe(false);
    expect(isEnterpriseDeliveryUnconfirmed({ status: "sent", sentAt: "not-a-date" }, Date.now())).toBe(false);
  });
});

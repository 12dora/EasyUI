// @vitest-environment node
/**
 * User risk: copied endpoints and descriptor tokens can be hundreds of
 * characters long; on a phone they must not widen the page beyond the viewport.
 */
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EnterpriseDescriptorKeysTable } from "./authorization-workspace";
import { EnterpriseCredentialLoginSurface } from "./auth-surfaces";
import { createEnterpriseLabelCatalog } from "./label-catalog";
import { EnterpriseIntegrationFactGrid } from "./shared-settings";
import { EnterpriseLoginSurfaceSkeleton } from "./surface-helpers";

interface BrowserPage {
  setContent(html: string): Promise<void>;
  evaluate<T>(callback: () => T): Promise<T>;
  close(): Promise<void>;
}

interface BrowserInstance {
  newPage(options: { viewport: { width: number; height: number } }): Promise<BrowserPage>;
  close(): Promise<void>;
}

interface PlaywrightModule {
  chromium: { launch(options: { headless: boolean; args: string[] }): Promise<BrowserInstance> };
}

const requireFromCustoms = createRequire(new URL("../../../../apps/customs/package.json", import.meta.url));
const { chromium } = requireFromCustoms("@playwright/test") as PlaywrightModule;

async function openNarrowPage(): Promise<{ browser: BrowserInstance; page: BrowserPage }> {
  const browser = await chromium.launch({ headless: true, args: ["--single-process", "--no-zygote"] });
  const page = await browser.newPage({ viewport: { width: 360, height: 640 } });
  return { browser, page };
}

function documentFor(markup: string): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>*{box-sizing:border-box}body{margin:0}.min-h-\\[80vh\\]{min-height:80vh}.w-full{width:100%}.max-w-sm{max-width:24rem}</style></head><body>${markup}</body></html>`;
}

describe("FE-UXA-10 login Suspense consumer contract", () => {
  it("the exact EnterpriseLoginSurfaceSkeleton fallback preserves ready-surface geometry", async () => {
    const labels = createEnterpriseLabelCatalog("en", { appName: "Test", appDescription: "Test" }, "business");
    const markup = renderToStaticMarkup(
      <>
        <div id="skeleton"><EnterpriseLoginSurfaceSkeleton /></div>
        <div id="ready">
          <EnterpriseCredentialLoginSurface
            labels={labels.login}
            username=""
            password=""
            totpCode=""
            oidcEnabled={false}
            oidcState="ready"
            loading={false}
            secondFactorMethods={null}
            activeMethod="totp"
            passkeyBusy={false}
            passkeySupported={false}
            onUsernameChange={() => undefined}
            onPasswordChange={() => undefined}
            onTotpCodeChange={() => undefined}
            onMethodChange={() => undefined}
            onOidcLogin={() => undefined}
            onOidcRetry={() => undefined}
            onPasskeyLogin={() => undefined}
            onSubmit={() => undefined}
          />
        </div>
      </>,
    );
    const { browser, page } = await openNarrowPage();
    await page.setContent(documentFor(markup));

    const geometry = await page.evaluate(() => {
      const skeletonSurface = document.querySelector<HTMLElement>("#skeleton > [data-test-id='login-surface-skeleton']")!;
      const readySurface = document.querySelector<HTMLElement>("#ready > [data-test-id='enterprise-login-page']")!;
      const skeletonCard = skeletonSurface.firstElementChild as HTMLElement;
      const readyCard = readySurface.firstElementChild as HTMLElement;
      return {
        skeletonBusy: skeletonSurface.getAttribute("aria-busy"),
        viewportHeight: window.innerHeight,
        skeletonHeight: skeletonSurface.getBoundingClientRect().height,
        readyHeight: readySurface.getBoundingClientRect().height,
        skeletonWidth: skeletonCard.getBoundingClientRect().width,
        readyWidth: readyCard.getBoundingClientRect().width,
      };
    });
    await page.close();
    await browser.close();

    expect(geometry.skeletonBusy).toBe("true");
    expect(geometry.skeletonHeight).toBeGreaterThanOrEqual(geometry.viewportHeight * 0.8);
    expect(geometry.skeletonHeight).toBe(geometry.readyHeight);
    expect(geometry.skeletonWidth).toBe(geometry.readyWidth);
  });
});

describe("FE-UXA-13 narrow viewport width contract", () => {
  it("wraps a long unbroken integration value inside its 320px container", async () => {
    const token = `https://easyauth.example/${"x".repeat(800)}`;
    const markup = renderToStaticMarkup(
      <div id="viewport" style={{ width: 320, maxWidth: "100%" }}>
        <EnterpriseIntegrationFactGrid
          testId="fact-grid"
          facts={[{ label: "Endpoint", value: token }]}
        />
      </div>,
    );
    const { browser, page } = await openNarrowPage();
    await page.setContent(documentFor(markup));

    const widths = await page.evaluate(() => {
      const viewport = document.querySelector<HTMLElement>("#viewport")!;
      const grid = document.querySelector<HTMLElement>("[data-test-id='fact-grid']")!;
      return {
        pageClient: document.documentElement.clientWidth,
        pageScroll: document.documentElement.scrollWidth,
        viewportRight: viewport.getBoundingClientRect().right,
        gridRight: grid.getBoundingClientRect().right,
        gridClient: grid.clientWidth,
        gridScroll: grid.scrollWidth,
      };
    });
    await page.close();
    await browser.close();

    expect(widths.gridRight).toBeLessThanOrEqual(widths.viewportRight);
    expect(widths.gridScroll).toBeLessThanOrEqual(widths.gridClient);
    expect(widths.pageScroll).toBeLessThanOrEqual(widths.pageClient);
  });

  it("contains an oversized descriptor row in its own scroller instead of widening the page", async () => {
    const markup = renderToStaticMarkup(
      <div id="viewport" style={{ width: 320, maxWidth: "100%" }}>
        <EnterpriseDescriptorKeysTable
          items={[{
            id: "key-1",
            name: `descriptor-${"n".repeat(700)}`,
            tokenPrefix: `token_${"t".repeat(700)}`,
            active: true,
            lastUsedAt: null,
            createdAt: "2026-01-01T00:00:00Z",
          }]}
          labels={{ disable: "Disable", enabled: "Enabled", delete: "Delete", empty: "No keys" }}
          onToggle={() => undefined}
          onDelete={() => undefined}
        />
      </div>,
    );
    const { browser, page } = await openNarrowPage();
    await page.setContent(documentFor(markup));

    const widths = await page.evaluate(() => {
      const viewport = document.querySelector<HTMLElement>("#viewport")!;
      const scroller = document.querySelector<HTMLElement>("[data-test-id='authz-descriptor-keys']")!;
      return {
        pageClient: document.documentElement.clientWidth,
        pageScroll: document.documentElement.scrollWidth,
        viewportRight: viewport.getBoundingClientRect().right,
        scrollerRight: scroller.getBoundingClientRect().right,
        scrollerClient: scroller.clientWidth,
        scrollerScroll: scroller.scrollWidth,
      };
    });
    await page.close();
    await browser.close();

    expect(widths.scrollerRight).toBeLessThanOrEqual(widths.viewportRight);
    expect(widths.scrollerScroll).toBeGreaterThan(widths.scrollerClient);
    expect(widths.pageScroll).toBeLessThanOrEqual(widths.pageClient);
  });
});

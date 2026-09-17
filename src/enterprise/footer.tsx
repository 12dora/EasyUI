"use client";

import { useMemo, type ReactNode } from "react";

/** `maxWidth` is opt-in; unset means full-bleed, so the footer tracks the topbar/shell frame. */
export function EnterpriseFooter({ children, maxWidth }: { children: ReactNode; maxWidth?: number }) {
  return <footer className="border-t border-hairline bg-paper-deep"><div className="mx-auto flex items-center px-5 py-3 text-[12px] text-ink-faint" style={{ maxWidth }}>{children}</div></footer>;
}

const FOOTER_LINK_CLASS = "max-w-full [&_a]:text-ink-soft [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-ink";

/**
 * Shared footer renderer used by every host; the backend remains the source of configured content.
 *
 * `bare` 是给「已经有别的容器」的位置用的 —— 具体来说是手机上 `MobileNav` 抽屉底部的页脚槽:
 * 那里再套一个 `<footer>` 会在抽屉的 `role="dialog"` 里嵌出第二个 contentinfo 地标(读屏会把它
 * 当成页面级页脚播报),边框 / 内边距也会跟抽屉自己的分隔线叠成双线。`bare` 去掉地标与外框,
 * 只留文案本身;test id 换成 `-inline` 后缀,这样同一份文案在页面底部与抽屉里能分别断言。
 */
export function EnterpriseConfiguredFooter({ html, fallback, maxWidth, bare = false }: { html?: string | null; fallback: ReactNode; maxWidth?: number; bare?: boolean }) {
  const safeHtml = useMemo(() => sanitizeFooterHtml((html ?? "").replaceAll("{year}", String(new Date().getFullYear()))), [html]);
  const suffix = bare ? "-inline" : "";
  const content = safeHtml ? (
    <span className={FOOTER_LINK_CLASS} data-test-id={`app-footer-html${suffix}`} dangerouslySetInnerHTML={{ __html: safeHtml }} />
  ) : (
    <span data-test-id={`app-footer-fallback${suffix}`}>{fallback}</span>
  );
  if (bare) return <div className="min-w-0 text-[12px] text-ink-faint">{content}</div>;
  return <EnterpriseFooter maxWidth={maxWidth}>{content}</EnterpriseFooter>;
}

const ALLOWED_TAGS = new Set(["A", "BR", "SPAN", "STRONG", "EM", "B", "I", "SMALL"]);
const ALLOWED_TARGETS = new Set(["_blank", "_self", "_parent", "_top"]);

function sanitizeFooterHtml(html: string): string {
  if (typeof window === "undefined" || !html) return "";
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild; if (!root) return "";
  const output = doc.createElement("div");
  for (const child of Array.from(root.childNodes)) { const safe = sanitizeNode(child, doc); if (safe) output.appendChild(safe); }
  return output.innerHTML;
}

function sanitizeNode(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.textContent ?? "");
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const source = node as Element; if (!ALLOWED_TAGS.has(source.tagName)) return null;
  const target = doc.createElement(source.tagName.toLowerCase());
  if (source.tagName === "A") {
    const href = source.getAttribute("href"); if (href && isSafeHref(href)) target.setAttribute("href", href);
    const title = source.getAttribute("title"); if (title) target.setAttribute("title", title);
    const linkTarget = source.getAttribute("target"); if (linkTarget && ALLOWED_TARGETS.has(linkTarget)) target.setAttribute("target", linkTarget);
    target.setAttribute("rel", "noopener noreferrer");
  }
  for (const child of Array.from(source.childNodes)) { const safe = sanitizeNode(child, doc); if (safe) target.appendChild(safe); }
  return target;
}

function isSafeHref(href: string): boolean {
  const value = href.trim();
  if (!value || /[\u0000-\u001f\u007f]/.test(value) || value.startsWith("//") || value.includes("\\")) return false;
  if (value.startsWith("/") || value.startsWith("#") || value.startsWith("mailto:") || value.startsWith("tel:")) return true;
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; }
}

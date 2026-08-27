import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderCollectionReturn,
  renderContentsLedger,
  renderContextNavigation,
  renderContextNavigationToggle,
  renderManuscriptControl,
  renderReaderHeader,
  renderUtilityDock
} from "./components.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const style = fs.readFileSync(path.join(root, "style.css"), "utf8");
for (const selector of [".site-header", ".collection-return", ".utility-dock", ".notes-page", ".reader-layout", ".context-nav"]) {
  assert(style.includes(selector), `The shared stylesheet is missing ${selector}.`);
}

assert(renderCollectionReturn({ href: "/books.html" }).includes('data-site-return'));
assert(renderManuscriptControl("book.pdf").includes("📖"));
assert(renderUtilityDock("control").includes('aria-label="Page tools"'));
assert(renderReaderHeader({ workTitle: "Work", location: "Chapter 1", title: "Title" }).includes("Work · Chapter 1"));
assert(renderContextNavigationToggle().includes("Manuscript contents"));
const collapsedLedger = renderContentsLedger({ key: "chapters", title: "Chapters", content: "items", collapsed: true });
assert(collapsedLedger.includes('data-default-collapsed="true"'));
assert(collapsedLedger.includes('class="contents-heading"><button class="contents-toggle"'));
assert(collapsedLedger.includes('aria-expanded="false"'));
assert(!collapsedLedger.includes("data-contents-collapse"));
assert(renderContextNavigation({ ledgers: [{ key: "chapters", title: "Chapters", content: "items" }] }).includes('class="contents-ledgers"'));

console.log("Validated reader-shell-v1 components and style contract.");

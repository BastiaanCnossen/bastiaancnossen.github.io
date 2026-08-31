import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { publishWork } from "./publish-notes.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "notes-publisher-test-"));
const candidateRoot = path.join(root, "candidate");
const candidatePdf = path.join(candidateRoot, "book.pdf");
const configPath = path.join(root, "publication", "works", "test-notes.json");
const retirementsPath = path.join(root, "publication", "retirements", "test-notes.json");
const publicBase = "/notes/test-notes/";

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writePage(route, ids, links = []) {
  const filePath = path.join(candidateRoot, ...route.split("/").filter(Boolean), "index.html");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `<!doctype html><html><head><meta charset="utf-8"></head><body><main>${ids.map((id) => `<section id='${id}'>${id}</section>`).join("")}${links.map((link) => `<a href='${link}'>Linked page</a>`).join("")}</main></body></html>`, "utf8");
}

function writeCandidate({ includeRetiredRoute = true, includeOldFragment = true, pdfContents = "PDF version 1" }) {
  fs.rmSync(candidateRoot, { recursive: true, force: true });
  fs.mkdirSync(candidateRoot, { recursive: true });
  fs.writeFileSync(candidatePdf, pdfContents, "utf8");
  writePage("/", [], ["entry/current/", "book.pdf"]);
  const routes = [{ Path: "/", Kind: "work", Fragments: [] }];
  if (includeRetiredRoute) {
    writePage("/entry/retired/", ["result:Retired"]);
    routes.push({
      Path: "/entry/retired/",
      Kind: "entry",
      SourceId: "retired",
      Fragments: [{ Id: "result:Retired", Kind: "latex-label" }],
    });
  }
  const fragmentIds = ["result:Current", ...(includeOldFragment ? ["detail-current--old-detail"] : [])];
  writePage("/entry/current/", fragmentIds, ["../../book.pdf"]);
  routes.push({
    Path: "/entry/current/",
    Kind: "entry",
    SourceId: "current",
    Fragments: [
      { Id: "result:Current", Kind: "latex-label" },
      ...(includeOldFragment ? [{ Id: "detail-current--old-detail", Kind: "proof-detail" }] : []),
    ],
  });
  writeJson(path.join(candidateRoot, "_meta", "public-contract.json"), {
    SchemaVersion: 1,
    WorkId: "test-notes",
    CanonicalBase: "https://example.test/notes/test-notes/",
    Routes: routes,
  });
}

function writeRetirements({ retireRoute = false, aliasFragment = false }) {
  writeJson(retirementsPath, {
    SchemaVersion: 1,
    WorkId: "test-notes",
    Routes: retireRoute ? [{
      Path: "/notes/test-notes/entry/retired/",
      Action: "tombstone",
      Added: "2026-08-25",
      Reason: "This fixture route was intentionally retired.",
    }] : [],
    Fragments: aliasFragment ? [{
      Path: "/notes/test-notes/entry/current/",
      Fragment: "detail-current--old-detail",
      Action: "alias",
      Target: "/notes/test-notes/entry/current/#result:Current",
      Added: "2026-08-25",
      Reason: "This fixture fragment now uses the result anchor.",
    }] : [],
  });
}

try {
  writeJson(configPath, {
    SchemaVersion: 1,
    WorkId: "test-notes",
    SourceBundle: "candidate",
    SourcePdf: "candidate/book.pdf",
    EmbeddedPdf: "book.pdf",
    PublicDirectory: "notes/test-notes",
    PublicPdf: "notes/test-notes.pdf",
    PublicBase: publicBase,
    Lockfile: "publication/locks/test-notes.json",
    Retirements: "publication/retirements/test-notes.json",
  });
  writeCandidate({});
  writeRetirements({});
  publishWork(configPath, { websiteRoot: root });

  const publicRoot = path.join(root, "notes", "test-notes");
  const publicPdf = path.join(root, "notes", "test-notes.pdf");
  const previousRoot = `${publicRoot}.__previous__`;
  const previousPdf = `${publicPdf}.__previous__`;
  assert.equal(fs.readFileSync(publicPdf, "utf8"), "PDF version 1");
  assert.ok(!fs.existsSync(path.join(publicRoot, "book.pdf")));
  assert.match(fs.readFileSync(path.join(publicRoot, "index.html"), "utf8"), /href='\/notes\/test-notes\.pdf'/);
  assert.match(fs.readFileSync(path.join(publicRoot, "entry", "current", "index.html"), "utf8"), /href='\/notes\/test-notes\.pdf'/);
  fs.renameSync(publicRoot, previousRoot);
  publishWork(configPath, { websiteRoot: root, checkOnly: true });
  assert.ok(fs.existsSync(publicRoot));
  assert.ok(!fs.existsSync(previousRoot));

  fs.renameSync(publicPdf, previousPdf);
  publishWork(configPath, { websiteRoot: root, checkOnly: true });
  assert.ok(fs.existsSync(publicPdf));
  assert.ok(!fs.existsSync(previousPdf));

  writeCandidate({ pdfContents: "PDF version 2" });
  publishWork(configPath, { websiteRoot: root, checkOnly: true });
  assert.equal(fs.readFileSync(publicPdf, "utf8"), "PDF version 1");

  writeCandidate({ includeRetiredRoute: false });
  assert.throws(
    () => publishWork(configPath, { websiteRoot: root, checkOnly: true }),
    /Locked route .* disappeared without an explicit redirect or tombstone/,
  );

  writeRetirements({ retireRoute: true });
  publishWork(configPath, { websiteRoot: root });
  const tombstone = fs.readFileSync(path.join(root, "notes", "test-notes", "entry", "retired", "index.html"), "utf8");
  assert.match(tombstone, /Page retired/);
  assert.match(tombstone, /id="result:Retired"/);

  writeCandidate({ includeRetiredRoute: false, includeOldFragment: false, pdfContents: "PDF version 2" });
  assert.throws(
    () => publishWork(configPath, { websiteRoot: root, checkOnly: true }),
    /Locked fragment .* disappeared without an explicit alias or tombstone/,
  );

  writeRetirements({ retireRoute: true, aliasFragment: true });
  publishWork(configPath, { websiteRoot: root });
  assert.equal(fs.readFileSync(publicPdf, "utf8"), "PDF version 2");
  const current = fs.readFileSync(path.join(root, "notes", "test-notes", "entry", "current", "index.html"), "utf8");
  assert.match(current, /id="detail-current--old-detail"/);
  assert.match(current, /#result:Current/);
  const ledger = JSON.parse(fs.readFileSync(path.join(root, "publication", "locks", "test-notes.json"), "utf8"));
  assert.equal(ledger.SourcePdfSha256, ledger.PublishedPdfSha256);
  assert.match(ledger.PublishedPdfSha256, /^[a-f0-9]{64}$/);
  assert.equal(ledger.Routes.find((route) => route.Path.endsWith("/entry/retired/")).Status, "tombstone");
  assert.equal(
    ledger.Routes.find((route) => route.Path.endsWith("/entry/current/"))
      .Fragments.find((fragment) => fragment.Id === "detail-current--old-detail").Status,
    "redirect",
  );
  console.log("Notes-publication regression tests passed.");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const inputs = ["components.mjs", "install.mjs", "reader.js", "reading-navigation.mjs", "style.css"];
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

export function readerRevision() {
  return `reader-shell-v1-${hash(inputs.map((name) => `${name}\n${hash(fs.readFileSync(path.join(root, name)))}`).join("\n")).slice(0, 16)}`;
}

export function installReaderShell(outputRoot, assetDirectory) {
  const output = path.resolve(outputRoot);
  const assets = path.resolve(output, assetDirectory);
  if (!assets.startsWith(`${output}${path.sep}`)) throw new Error("Reader assets must be inside the output bundle.");
  fs.mkdirSync(assets, { recursive: true });
  const files = {};
  for (const name of ["reader.js", "style.css"]) {
    const contents = fs.readFileSync(path.join(root, name));
    fs.writeFileSync(path.join(assets, name), contents);
    files[path.relative(output, path.join(assets, name)).split(path.sep).join("/")] = hash(contents);
  }
  const receipt = { SchemaVersion: 1, ReaderShell: "reader-shell-v1", Revision: readerRevision(), Assets: files };
  fs.mkdirSync(path.join(output, "_meta"), { recursive: true });
  fs.writeFileSync(path.join(output, "_meta", "reader-build.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

export function validateReaderShell(outputRoot) {
  const output = path.resolve(outputRoot);
  const receipt = JSON.parse(fs.readFileSync(path.join(output, "_meta", "reader-build.json"), "utf8"));
  if (receipt.SchemaVersion !== 1 || receipt.Revision !== readerRevision()) throw new Error("Rebuild this edition with the current shared reader interface.");
  for (const [relative, expected] of Object.entries(receipt.Assets)) {
    const target = path.resolve(output, relative);
    if (!target.startsWith(`${output}${path.sep}`) || hash(fs.readFileSync(target)) !== expected) throw new Error(`Reader asset differs from its build receipt: ${relative}`);
  }
  if (Object.keys(receipt.Assets).length !== 2) throw new Error("The reader receipt must contain its stylesheet and runtime.");
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== "_assets") visit(target);
      if (!entry.isFile() || entry.name !== "index.html") continue;
      const html = fs.readFileSync(target, "utf8");
      // Redirects and retirement notices do not need the interactive reader.
      if (!html.includes("utility-dock")) continue;
      const tags = [...html.matchAll(/<script\b[^>]*\bdata-notes-reader="([^"]+)"[^>]*><\/script>/g)];
      if (tags.length !== 1 || !tags[0][0].includes(`data-reader-revision="${receipt.Revision}"`)) throw new Error(`Missing or stale shared reader runtime on ${target}`);
      const source = tags[0][0].match(/\bsrc="([^"]+)"/)?.[1];
      if (!source || !fs.existsSync(path.resolve(path.dirname(target), source))) throw new Error(`Missing reader runtime on ${target}`);
    }
  };
  visit(output);
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [output, assets] = process.argv.slice(2);
  if (!output) throw new Error("Usage: node install.mjs OUTPUT_ROOT [ASSET_DIRECTORY]");
  const receipt = assets ? installReaderShell(output, assets) : validateReaderShell(output);
  console.log(`${assets ? "Installed" : "Validated"} ${receipt.Revision}.`);
}

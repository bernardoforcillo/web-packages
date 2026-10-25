#!/usr/bin/env node
// Copies the version of crates/vite-serve/package.json (bumped by `changeset version`)
// into crates/vite-serve/Cargo.toml (the [package] table) and Cargo.lock (the
// vite-serve entry). Offline and idempotent. Optional argument: the crate directory.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const crateDir = resolve(
  process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..", "crates", "vite-serve"),
);
const files = {
  "package.json": join(crateDir, "package.json"),
  "Cargo.toml": join(crateDir, "Cargo.toml"),
  "Cargo.lock": join(crateDir, "Cargo.lock"),
};

function fail(message) {
  console.error(`sync-cargo-version: ${message}`);
  process.exit(1);
}

for (const [name, path] of Object.entries(files)) {
  if (!existsSync(path)) fail(`${name} not found at ${path}`);
}

const version = JSON.parse(readFileSync(files["package.json"], "utf8")).version;
if (typeof version !== "string" || !/^\d+\.\d+\.\d+([-+].+)?$/.test(version)) {
  fail(`package.json has no valid "version" (got ${JSON.stringify(version)})`);
}

/** Replaces `version = "..."` inside the first table/block whose header line matches `header`. */
function setVersion(text, header, name, file) {
  const lines = text.split("\n");
  let inBlock = false;
  let isTarget = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    if (line.startsWith("[")) {
      inBlock = line === header;
      isTarget = false;
      continue;
    }
    if (!inBlock) continue;
    if (header === "[[package]]") {
      if (line === `name = "${name}"`) isTarget = true;
      if (!isTarget) continue;
    }
    if (/^version\s*=\s*"/.test(line)) {
      lines[i] = lines[i].replace(/^(version\s*=\s*)"[^"]*"/, `$1"${version}"`);
      return lines.join("\n");
    }
  }
  return fail(`no ${header} version field for "${name}" in ${file}`);
}

const toml = readFileSync(files["Cargo.toml"], "utf8");
const crateName = /^\[package\][\s\S]*?^name\s*=\s*"([^"]+)"/m.exec(toml)?.[1];
if (!crateName) fail(`no [package] name in ${files["Cargo.toml"]}`);

const lock = readFileSync(files["Cargo.lock"], "utf8");
const nextToml = setVersion(toml, "[package]", crateName, files["Cargo.toml"]);
const nextLock = setVersion(lock, "[[package]]", crateName, files["Cargo.lock"]);

let changed = false;
if (nextToml !== toml) (writeFileSync(files["Cargo.toml"], nextToml), (changed = true));
if (nextLock !== lock) (writeFileSync(files["Cargo.lock"], nextLock), (changed = true));
console.log(`sync-cargo-version: ${crateName} ${version} (${changed ? "updated" : "already in sync"})`);

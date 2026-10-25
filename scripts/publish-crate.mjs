#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const crate = JSON.parse(
  readFileSync(join(root, "crates", "vite-serve", "package.json"), "utf8"),
);
const crateName = "vite-serve";
const version = crate.version;

if (typeof version !== "string" || !/^\d+\.\d+\.\d+([-+].+)?$/.test(version)) {
  throw new Error(`Invalid ${crateName} version: ${JSON.stringify(version)}`);
}

const response = await fetch(
  `https://crates.io/api/v1/crates/${crateName}/${encodeURIComponent(version)}`,
  { headers: { "User-Agent": "web-packages-release" } },
);

if (response.ok) {
  console.log(`${crateName} ${version} is already published on crates.io; skipping`);
} else if (response.status === 404) {
  execFileSync(
    "cargo",
    ["publish", "--manifest-path", join(root, "crates", "vite-serve", "Cargo.toml")],
    { cwd: root, stdio: "inherit" },
  );
} else {
  throw new Error(
    `Could not check ${crateName} ${version} on crates.io: ${response.status} ${response.statusText}`,
  );
}

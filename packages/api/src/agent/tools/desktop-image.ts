// The image of the characters' computers (packages/api/desktop), tagged by its files' contents so
// that the app and the image published to the registry always match. CI prints the tag with
// `bun packages/api/src/agent/tools/desktop-image.ts`.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const DESKTOP_REPOSITORY = "ghcr.io/picapica52/nextroom-desktop";
export const DESKTOP_DIR = join(import.meta.dir, "../../../desktop");
const FILES = ["Dockerfile", "start.sh", "control.py", "files.py", "view.html"];

export function desktopImage(): string {
	const hash = createHash("sha256");
	for (const file of FILES) hash.update(readFileSync(join(DESKTOP_DIR, file)));
	return `${DESKTOP_REPOSITORY}:${hash.digest("hex").slice(0, 12)}`;
}

if (import.meta.main) console.log(desktopImage());

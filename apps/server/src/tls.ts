import { mkdir } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { join, resolve } from "node:path";
import { generate } from "selfsigned";

/** This PC's IPv4 addresses, which phones on the local network open the app by. */
export function localAddresses(): string[] {
	return Object.values(networkInterfaces())
		.flat()
		.filter((n) => n?.family === "IPv4")
		.map((n) => n?.address as string);
}

/** iOS refuses server certificates valid for longer than 825 days. */
const VALID_DAYS = 800;
/** Made again this long before it expires. */
const RENEW_DAYS = 30;
const DAY_MS = 86_400_000;

/** The hosts and expiry the certificate was made for; null when unreadable (it is made again). */
async function readMeta(file: Bun.BunFile): Promise<{ hosts: string[]; expires: number } | null> {
	try {
		const meta: unknown = await file.json();
		if (typeof meta !== "object" || meta === null) return null;
		const { hosts, expires } = meta as Record<string, unknown>;
		if (!Array.isArray(hosts) || !hosts.every((h) => typeof h === "string")) return null;
		if (typeof expires !== "number" || !Number.isFinite(expires)) return null;
		return { hosts, expires };
	} catch {
		return null;
	}
}

/**
 * A self-signed certificate for this PC, kept in `dir`. Browsers give the microphone only to HTTPS
 * pages (and localhost), so phones need one. Made again when the PC's addresses change or it is
 * about to expire.
 */
export async function selfSignedCertificate(dir: string): Promise<{ cert: string; key: string }> {
	const certFile = Bun.file(join(dir, "cert.pem"));
	const keyFile = Bun.file(join(dir, "key.pem"));
	const metaFile = Bun.file(join(dir, "meta.json"));
	const hosts = ["localhost", ...localAddresses()];
	if ((await certFile.exists()) && (await keyFile.exists()) && (await metaFile.exists())) {
		const meta = await readMeta(metaFile);
		if (
			meta &&
			hosts.every((h) => meta.hosts.includes(h)) &&
			meta.expires - Date.now() > RENEW_DAYS * DAY_MS
		)
			return { cert: await certFile.text(), key: await keyFile.text() };
	}
	const notAfterDate = new Date(Date.now() + VALID_DAYS * DAY_MS);
	const pems = await generate([{ name: "commonName", value: "Nextroom" }], {
		keyType: "ec",
		algorithm: "sha256",
		notAfterDate,
		extensions: [
			{ name: "basicConstraints", cA: false },
			{ name: "keyUsage", digitalSignature: true, keyEncipherment: true },
			{ name: "extKeyUsage", serverAuth: true },
			{
				name: "subjectAltName",
				altNames: hosts.map((h) =>
					h === "localhost" ? { type: 2, value: h } : { type: 7, ip: h },
				),
			},
		],
	});
	// Bun on Windows can throw EEXIST for a relative path even with `recursive`.
	await mkdir(resolve(dir), { recursive: true }).catch((error: NodeJS.ErrnoException) => {
		if (error.code !== "EEXIST") throw error;
	});
	await Bun.write(certFile, pems.cert);
	await Bun.write(keyFile, pems.private);
	await Bun.write(metaFile, JSON.stringify({ hosts, expires: notAfterDate.getTime() }));
	return { cert: pems.cert, key: pems.private };
}

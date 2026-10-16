import { join } from "node:path";
import { apiRouter, configure } from "@nextroom/api";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { logger } from "hono/logger";
import { ENV } from "./env.server";
import { localAddresses, selfSignedCertificate } from "./tls";

configure({ dataDir: ENV.DATA_DIR });

const app = new Hono();

app.use("/api/*", logger());
app.route("/api", apiRouter);

// The built web app, with every other path answered by its index so a reload on
// `/characters/...` lands on the app rather than on a 404.
if (ENV.WEB_DIST && (await Bun.file(`${ENV.WEB_DIST}/index.html`).exists())) {
	const root = ENV.WEB_DIST;
	app.use("/*", serveStatic({ root }));
	app.get("*", serveStatic({ root, path: "index.html" }));
} else {
	app.get("/", (c) => c.text("OK"));
}

const serve = {
	// Other devices on the local network open it too; there is no sign-in.
	hostname: "0.0.0.0",
	fetch: app.fetch,
	// Making a face with image generation can keep one request open for minutes.
	idleTimeout: 0,
};

Bun.serve({
	...serve,
	port: ENV.HTTPS_PORT,
	tls: await selfSignedCertificate(join(ENV.DATA_DIR, "tls")),
});

const phones = localAddresses()
	.filter((ip) => ip !== "127.0.0.1")
	.map((ip) => `https://${ip}:${ENV.HTTPS_PORT}`);
console.log(`Nextroom: http://127.0.0.1:${ENV.PORT}`);
if (phones.length)
	console.log(
		`同じネットワークのスマホからは（初回は証明書の警告を許可して）: ${phones.join(" ")}`,
	);

export default { ...serve, port: ENV.PORT };

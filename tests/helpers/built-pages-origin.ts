import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const base = "/InflammMenu/";

// Serve real build files, then stop the origin. Browser offline emulation
// alone does not consistently allow WebKit service-worker navigation.
export async function builtOrigin() {
  const root = resolve("dist/pages");
  const requests: string[] = [];
  const mime: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".jpg": "image/jpeg", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff" };
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://local.test").pathname;
      requests.push(pathname);
      if (!pathname.startsWith(base)) { response.writeHead(404); response.end(); return; }
      const filename = resolve(root, decodeURIComponent(pathname.slice(base.length)) || "index.html");
      if (!filename.startsWith(`${root}${sep}`)) { response.writeHead(404); response.end(); return; }
      const bytes = await readFile(filename);
      response.writeHead(200, { "Content-Type": mime[extname(filename)] ?? "application/octet-stream", "Content-Length": bytes.byteLength, "Cache-Control": "no-cache" });
      response.end(bytes);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Serveur de build indisponible");
  return { url: `http://127.0.0.1:${address.port}`, requests, stop: async () => {
    if (!server.listening) return;
    await new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); server.closeAllConnections(); });
  } };
}

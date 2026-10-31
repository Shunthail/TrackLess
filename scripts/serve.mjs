import "./build.mjs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";

const root = resolve("dist/chrome");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
};
createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    const file = resolve(root, "." + (path === "/" ? "/popup.html" : path));
    if (!file.startsWith(root + "/") || !types[extname(file)])
      throw new Error();
    const contents = await readFile(file);
    response.writeHead(200, {
      "Content-Type": types[extname(file)],
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'",
    });
    response.end(contents);
  } catch {
    response.writeHead(404);
    response.end("Introuvable");
  }
}).listen(3040, "127.0.0.1", () =>
  console.log(
    "Interface : http://127.0.0.1:3040 (le blocage nécessite de charger l’extension).",
  ),
);

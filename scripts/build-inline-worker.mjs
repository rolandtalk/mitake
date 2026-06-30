import { readFile, writeFile } from "node:fs/promises";

const workerSource = await readFile("dist/index.js", "utf8");
const html = await readFile("public/index.html", "utf8");
const appJs = await readFile("public/app.js", "utf8");
const styles = await readFile("public/styles.css", "utf8");

const patchedWorker = workerSource.replace(
  "return env.ASSETS.fetch(request);",
  "return serveStatic(url.pathname);"
);

const staticHandler = `
const STATIC_FILES = new Map([
  ["/", { body: ${JSON.stringify(html)}, type: "text/html; charset=utf-8" }],
  ["/index.html", { body: ${JSON.stringify(html)}, type: "text/html; charset=utf-8" }],
  ["/app.js", { body: ${JSON.stringify(appJs)}, type: "application/javascript; charset=utf-8" }],
  ["/styles.css", { body: ${JSON.stringify(styles)}, type: "text/css; charset=utf-8" }]
]);

function serveStatic(pathname) {
  const asset = STATIC_FILES.get(pathname) || STATIC_FILES.get("/");
  return new Response(asset.body, {
    headers: {
      "content-type": asset.type,
      "cache-control": pathname === "/" || pathname === "/index.html" ? "no-store" : "public, max-age=300"
    }
  });
}
`;

await writeFile("dist/worker-inline.mjs", `${patchedWorker}\n${staticHandler}`, "utf8");

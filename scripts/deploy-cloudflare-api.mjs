import { readFile } from "node:fs/promises";

const accountId = "dc71e29616572418b1671b2b297fafab";
const scriptName = "mitake";
const token = process.env.CLOUDFLARE_API_TOKEN;

if (!token) {
  throw new Error("CLOUDFLARE_API_TOKEN is required");
}

async function cloudflare(path, options = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok || data.success === false) {
    throw new Error(JSON.stringify({ status: response.status, data }, null, 2));
  }
  return data;
}

const source = await readFile("dist/worker-inline.mjs", "utf8");
const form = new FormData();
form.append(
  "metadata",
  new Blob([
    JSON.stringify({
      main_module: "worker-inline.mjs",
      compatibility_date: "2026-06-29"
    })
  ], { type: "application/json" }),
  "metadata.json"
);
form.append(
  "worker-inline.mjs",
  new Blob([source], { type: "application/javascript+module" }),
  "worker-inline.mjs"
);

const upload = await cloudflare(`/accounts/${accountId}/workers/scripts/${scriptName}`, {
  method: "PUT",
  body: form
});

let subdomain = null;
try {
  const enabled = await cloudflare(`/accounts/${accountId}/workers/scripts/${scriptName}/subdomain`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: true })
  });
  subdomain = enabled.result;
} catch (error) {
  subdomain = { warning: error.message };
}

let workersDev = null;
try {
  workersDev = (await cloudflare(`/accounts/${accountId}/workers/subdomain`)).result;
} catch (error) {
  workersDev = { warning: error.message };
}

console.log(JSON.stringify({
  uploaded: upload.success === true,
  id: upload.result?.id,
  etag: upload.result?.etag,
  subdomain,
  workersDev,
  url: workersDev?.subdomain ? `https://${scriptName}.${workersDev.subdomain}.workers.dev/` : null
}, null, 2));

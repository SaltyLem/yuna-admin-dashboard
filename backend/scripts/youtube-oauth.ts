/**
 * YouTube OAuth refresh-token issuer (localhost flow).
 *
 * Google OAuth client が localhost:8080 のみ redirect を許可してる前提.
 * 一時的に localhost:8080 で http server を立てて code を受け取り、
 * refresh_token に交換 → admin-backend に PUT して保存する.
 *
 * 使い方 (Mac から):
 *
 *   YOUTUBE_OAUTH_CLIENT_ID=...           \
 *   YOUTUBE_OAUTH_CLIENT_SECRET=...       \
 *   ADMIN_API_URL=http://192.168.11.13:4100 \
 *   ADMIN_SERVICE_TOKEN=...               \
 *   CHANNEL=ja                            \
 *     npx tsx scripts/youtube-oauth.ts
 *
 *   1. ターミナルに出る authorize URL をブラウザで開く
 *   2. 対象 Google アカウント (ja=YunaOnChainJP / en=YunaSolana) でログイン
 *   3. 「許可」を押す → localhost:8080 にリダイレクト
 *   4. 自動で code → refresh_token 交換 → admin-backend に保存
 *
 * 同じ refresh_token が prod で使われる (channel_id / channel_title も
 * youtube data api から取得して保存).
 */

import http from "node:http";
import { URL } from "node:url";

const CLIENT_ID = process.env["YOUTUBE_OAUTH_CLIENT_ID"] ?? "";
const CLIENT_SECRET = process.env["YOUTUBE_OAUTH_CLIENT_SECRET"] ?? "";
const ADMIN_API_URL = (process.env["ADMIN_API_URL"] ?? "http://192.168.11.13:4100").replace(/\/$/, "");
const ADMIN_SERVICE_TOKEN = process.env["ADMIN_SERVICE_TOKEN"] ?? "";
const CHANNEL = process.env["CHANNEL"] ?? "";
const REDIRECT_URI = "http://localhost:8080/";
const PORT = 8080;
const SCOPES = ["https://www.googleapis.com/auth/youtube"];

function fail(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

if (!CLIENT_ID || !CLIENT_SECRET) fail("YOUTUBE_OAUTH_CLIENT_ID / SECRET required");
if (!ADMIN_SERVICE_TOKEN) fail("ADMIN_SERVICE_TOKEN required");
if (CHANNEL !== "ja" && CHANNEL !== "en") fail("CHANNEL must be 'ja' or 'en'");

async function exchangeCode(code: string): Promise<{ refresh_token: string; access_token: string }> {
  const body = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) fail(`token exchange failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { refresh_token?: string; access_token?: string };
  if (!data.refresh_token) fail(`no refresh_token returned (response: ${JSON.stringify(data)})`);
  if (!data.access_token) fail("no access_token returned");
  return { refresh_token: data.refresh_token!, access_token: data.access_token! };
}

async function fetchChannel(accessToken: string): Promise<{ id: string; title: string }> {
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) fail(`channel fetch failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { items?: Array<{ id: string; snippet: { title: string } }> };
  const item = data.items?.[0];
  if (!item) fail("channel not found (no items)");
  return { id: item!.id, title: item!.snippet.title };
}

async function saveCredentials(c: {
  refresh_token: string;
  channel_id: string;
  channel_title: string;
}): Promise<void> {
  const res = await fetch(`${ADMIN_API_URL}/stream/youtube/credentials/${CHANNEL}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${ADMIN_SERVICE_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      refresh_token: c.refresh_token,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      channel_id: c.channel_id,
      channel_title: c.channel_title,
    }),
  });
  if (!res.ok) fail(`admin-backend save failed: ${res.status} ${await res.text()}`);
}

async function main(): Promise<void> {
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent"); // refresh_token を確実に取る

  console.log("\n=== YouTube OAuth ===");
  console.log(`channel: ${CHANNEL}`);
  console.log(`admin: ${ADMIN_API_URL}`);
  console.log("\nOpen this URL in browser, log in with the target Google account, allow:\n");
  console.log(authUrl.toString());
  console.log("\nWaiting for callback on http://localhost:8080/ ...\n");

  await new Promise<void>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", REDIRECT_URI);
        const code = url.searchParams.get("code");
        const err = url.searchParams.get("error");
        if (err) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end(`OAuth error: ${err}`);
          server.close();
          reject(new Error(err));
          return;
        }
        if (!code) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing code");
          return;
        }
        console.log(`got code (${code.slice(0, 12)}...), exchanging...`);
        const tok = await exchangeCode(code);
        console.log("✓ refresh_token obtained, fetching channel info...");
        const ch = await fetchChannel(tok.access_token);
        console.log(`✓ channel: ${ch.title} (${ch.id})`);
        console.log(`saving to admin-backend...`);
        await saveCredentials({
          refresh_token: tok.refresh_token,
          channel_id: ch.id,
          channel_title: ch.title,
        });
        console.log(`✓ saved as channel '${CHANNEL}' = ${ch.title} (${ch.id})`);

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<h1>OK</h1><p>Saved ${CHANNEL} = ${ch.title}</p><p>You can close this tab.</p>`);
        setTimeout(() => server.close(), 100);
        resolve();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(`error: ${msg}`);
        server.close();
        reject(e);
      }
    });
    server.listen(PORT, () => {});
    server.on("error", reject);
  });

  console.log("\nDone. The new credentials are now active for the next /stream/youtube/switch call.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

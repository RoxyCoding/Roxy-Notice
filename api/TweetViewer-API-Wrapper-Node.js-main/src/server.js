import { createServer } from "node:http";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { TweetViewerClient, TweetViewerError } from "./client.js";

const MAX_BODY_BYTES = 16 * 1024;

/**
 * Create a small local REST API around Tweet Viewer.
 *
 * @param {import('./index.js').ServerOptions} [options]
 */
export function createTweetViewerServer(options = {}) {
  const client = options.client ?? new TweetViewerClient();
  const corsOrigin = options.corsOrigin === undefined ? "*" : options.corsOrigin;

  return createServer(async (request, response) => {
    if (corsOrigin !== false) response.setHeader("access-control-allow-origin", corsOrigin);
    response.setHeader("access-control-allow-headers", "content-type, range");
    response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");

    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }

    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      let result;

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/media/file") {
        const upstream = await client.fetchMedia(url.searchParams.get("url") ?? "", {
          range: request.headers.range,
        });
        const headers = {};
        for (const name of ["accept-ranges", "content-disposition", "content-length", "content-range", "content-type", "last-modified"]) {
          const value = upstream.headers.get(name);
          if (value) headers[name] = value;
        }
        response.writeHead(upstream.status, headers);
        if (upstream.body) Readable.fromWeb(upstream.body).on("error", () => response.destroy()).pipe(response);
        else response.end();
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/media/resolve") {
        const target = url.searchParams.get("url") ?? url.searchParams.get("id") ?? "";
        const result = await client.resolveMedia(target, {
          language: url.searchParams.get("lang") || undefined,
        });
        sendJson(response, 200, result);
        return;
      }

      let match = url.pathname.match(/^\/v1\/profiles\/([^/]+)\/timeline$/);
      if (request.method === "GET" && match) {
        const handle = decodeURIComponent(match[1]);
        const cursor = url.searchParams.get("cursor") || undefined;
        result = await client.getTimeline(handle, { cursor });
      } else if (request.method === "GET" && (match = url.pathname.match(/^\/v1\/profiles\/([^/]+)\/latest$/))) {
        const tweet = await client.getLatestTweet(decodeURIComponent(match[1]), {
          includeReplies: url.searchParams.get("includeReplies") !== "0",
          includeRetweets: url.searchParams.get("includeRetweets") !== "0",
        });
        result = { ok: true, source: "fxtwitter-v2-live", tweet };
      } else if (request.method === "GET" && (match = url.pathname.match(/^\/v1\/profiles\/([^/]+)$/))) {
        result = await client.getProfile(decodeURIComponent(match[1]));
      } else if (request.method === "GET" && (match = url.pathname.match(/^\/v1\/tweets\/([^/]+)$/))) {
        result = await client.getTweet(decodeURIComponent(match[1]));
      } else if (request.method === "POST" && url.pathname === "/v1/view") {
        const body = await readJson(request);
        result = await client.view(body?.q);
      } else {
        sendJson(response, 404, { ok: false, error: "Not found" });
        return;
      }

      sendJson(response, 200, result);
    } catch (error) {
      if (error instanceof TweetViewerError) {
        const upstreamStatus = error.status && error.status >= 400 ? error.status : undefined;
        const status = upstreamStatus ?? ({
          ABORTED: 504,
          NETWORK_ERROR: 502,
          INVALID_JSON: 502,
          INVALID_LIVE_JSON: 502,
          LIVE_API_ERROR: 502,
          UNEXPECTED_RESPONSE: 502,
        }[error.code] ?? 400);
        sendJson(response, status, {
          ok: false,
          code: error.code,
          error: error.message,
        });
        return;
      }
      if (error instanceof SyntaxError) {
        sendJson(response, 400, { ok: false, code: "INVALID_JSON", error: error.message });
        return;
      }
      console.error(error);
      sendJson(response, 500, { ok: false, error: "Internal server error" });
    }
  });
}

/** @param {import('node:http').ServerResponse} response @param {number} status @param {unknown} data */
function sendJson(response, status, data) {
  const body = JSON.stringify(data);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

/** @param {import('node:http').IncomingMessage} request */
async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw new SyntaxError("Request body is too large");
    chunks.push(chunk);
  }
  if (length === 0) throw new SyntaxError("JSON body is required");
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("PORT must be an integer between 1 and 65535");
    process.exitCode = 1;
  } else {
    createTweetViewerServer().listen(port, host, () => {
      console.log(`Tweet Viewer wrapper: http://${host}:${port}`);
    });
  }
}

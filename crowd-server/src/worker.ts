import { handleAdmin } from './admin';
import type { Db, PackStorage, Statement } from './db';
import { sha256Hex, importPrivateJwk, signEd25519 } from './crypto';
import { handleDelete, handleVotes, ProviderAllowList, SetAllowList, type AllowList, type Reply } from './ingest';
import { getConfig } from './config';
import { maintain, publish, type PublishDeps, type Signer } from './publish';

/**
 * The HTTP layer (section 11) and the Cloudflare Worker entry. `handleRequest` is plain Request in, Response out,
 * so it is tested without Cloudflare; `worker` below only wires D1, R2 and the secrets to it.
 */

export interface Services extends PublishDeps {
  adminToken?: string;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

const json = (status: number, body: unknown, extra: Record<string, string> = {}): Response =>
  new Response(status === 204 || body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  });

const fromReply = (r: Reply): Response => json(r.status, r.body, CORS);

async function allowListFor(storage: PackStorage, providers: string[]): Promise<AllowList> {
  const text = await storage.get('allowlist.json');
  if (!text) return new ProviderAllowList(providers);
  const data = JSON.parse(text) as { entries: string[]; senses?: string[] };
  return new SetAllowList(data.entries, data.senses);
}

async function servePublic(storage: PackStorage, path: string, request: Request, maxAge: number): Promise<Response> {
  const body = await storage.get(path);
  if (body === null) return new Response('not found', { status: 404, headers: CORS });
  const etag = `"${(await sha256Hex(body)).slice(0, 32)}"`;
  const headers = { ...CORS, 'content-type': 'application/json', etag, 'cache-control': `public, max-age=${maxAge}` };
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  return new Response(body, { status: 200, headers });
}

const PACK_PATH = /^\/packs\/v1\/(pooled|book)\/[a-z2-7]{1,32}\.json$/;

export async function handleRequest(request: Request, services: Services): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  if (pathname === '/health') return json(200, { ok: true }, CORS);

  // The manifest is cached for an hour, so the kill switch reaches apps quickly (section 9.4).
  if (method === 'GET' && pathname === '/manifest.json') return servePublic(services.storage, 'manifest.json', request, 3600);
  if (method === 'GET' && PACK_PATH.test(pathname)) return servePublic(services.storage, pathname.slice(1), request, 3600);

  if (pathname.startsWith('/v1/admin/')) {
    const body = method === 'POST' ? await request.text() : '';
    const r = await handleAdmin({ ...services }, method, pathname.slice('/v1/admin'.length), request.headers.get('authorization'), body);
    return json(r.status, r.json);
  }

  if (method === 'POST' && (pathname === '/v1/votes' || pathname === '/v1/delete')) {
    const raw = await request.text();
    const ip = request.headers.get('cf-connecting-ip') ?? '0.0.0.0';
    const deps = { db: services.db, now: services.now, ip };
    if (pathname === '/v1/votes') {
      const config = await getConfig(services.db);
      return fromReply(await handleVotes({ ...deps, allowList: await allowListFor(services.storage, config.providers) }, raw));
    }
    return fromReply(await handleDelete(deps, raw));
  }
  return json(404, { error: 'not_found' }, CORS);
}

/** The daily job: clean up, then aggregate and publish (sections 8, 14). */
export async function runNightly(services: Services): Promise<void> {
  await maintain(services);
  await publish(services);
}

// ---- Cloudflare bindings ----

interface D1Statement {
  bind(...params: unknown[]): D1Statement;
  run(): Promise<unknown>;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
}
interface D1Like {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown>;
}
interface R2Object {
  text(): Promise<string>;
}
interface R2Like {
  put(key: string, value: string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2Object | null>;
  list(options: { prefix: string; cursor?: string }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
  delete(key: string): Promise<void>;
}

export interface Env {
  DB: D1Like;
  PACKS: R2Like;
  /** The Ed25519 private key as a JWK string. Set with `wrangler secret put`. */
  SIGNING_KEY: string;
  ADMIN_TOKEN?: string;
}

export function d1Db(d1: D1Like): Db {
  const prep = (sql: string, params?: unknown[]) => d1.prepare(sql).bind(...(params ?? []));
  return {
    async run(sql, params) {
      await prep(sql, params).run();
    },
    async all<T>(sql: string, params?: unknown[]) {
      return (await prep(sql, params).all<T>()).results;
    },
    async get<T>(sql: string, params?: unknown[]) {
      return (await prep(sql, params).first<T>()) ?? undefined;
    },
    async batch(statements: Statement[]) {
      if (statements.length) await d1.batch(statements.map((s) => prep(s.sql, s.params)));
    },
  };
}

export function r2Storage(bucket: R2Like): PackStorage {
  return {
    put: (path, body, contentType = 'application/json') => bucket.put(path, body, { httpMetadata: { contentType } }).then(() => undefined),
    async get(path) {
      const obj = await bucket.get(path);
      return obj ? obj.text() : null;
    },
    async list(prefix) {
      const out: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await bucket.list({ prefix, cursor });
        out.push(...page.objects.map((o) => o.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return out.sort();
    },
    delete: (path) => bucket.delete(path),
  };
}

async function servicesFor(env: Env): Promise<Services> {
  const key = await importPrivateJwk(JSON.parse(env.SIGNING_KEY) as JsonWebKey);
  const signer: Signer = { sign: (m) => signEd25519(key, m) };
  return { db: d1Db(env.DB), storage: r2Storage(env.PACKS), signer, now: () => Date.now(), adminToken: env.ADMIN_TOKEN };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, await servicesFor(env));
    } catch {
      // Never reveal internals to a caller; the Worker log has the detail.
      return json(500, { error: 'server_error' }, CORS);
    }
  },
  async scheduled(_event: unknown, env: Env): Promise<void> {
    await runNightly(await servicesFor(env));
  },
};

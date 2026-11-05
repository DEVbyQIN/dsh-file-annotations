/**
 * dsh-file-annotations — host half.
 *
 * Owns one thing: the durable annotation store that lives inside the workspace
 * being annotated, so the agent itself can read the raw batch later.
 *
 *   <workspace>/.dsh/annotations.json
 *
 * Five exact POST routes back the browser half:
 *   POST api/dsh-file-annotations/resolve { sessionId }      -> { cwd }
 *   POST api/dsh-file-annotations/read   { cwd }              -> { annotations, path }
 *   POST api/dsh-file-annotations/write  { cwd, annotations } -> { path, count, bytes }
 *   POST api/dsh-file-annotations/crop   { cwd, id, dataUrl } -> { path }
 *   POST api/dsh-file-annotations/crop-preview { cwd, id }    -> { dataUrl }
 *
 * Design notes:
 *   - The browser half is the source of truth while a tab is open; this half only
 *     persists. A write always replaces the file (the client sends the full set),
 *     so independent browser writers can overwrite each other's full snapshots.
 *   - `cwd` arrives from the client because the sidebar already knows the
 *     Session's workspace root; this half still re-validates it: absolute, an
 *     existing directory, and the write target is exactly `<cwd>/.dsh/...`.
 *   - No model-facing tool and no prompt content: an annotation only becomes
 *     model input when the user presses the send button, and that path goes
 *     through the composer, not through this store.
 *   - This module must NOT default-export: the Cordis loader would replace the
 *     plugin object and silently drop `name` / `inject`.
 */

import { promises as fs } from 'node:fs';
import { dirname, isAbsolute, join, posix, resolve, relative } from 'node:path';

export const name = 'dsh-file-annotations';

/** Everything is optional here: the routes only appear when a transport exists. */
export const inject = [];

const RESOLVE_ROUTE = '/api/dsh-file-annotations/resolve';
const CROP_ROUTE = '/api/dsh-file-annotations/crop';
const CROP_PREVIEW_ROUTE = '/api/dsh-file-annotations/crop-preview';
const READ_ROUTE = '/api/dsh-file-annotations/read';
const WRITE_ROUTE = '/api/dsh-file-annotations/write';
const STORE_DIR = '.dsh';
const STORE_FILE = 'annotations.json';

/** Hard ceilings: one runaway payload must not fill the disk. */
const MAX_ANNOTATIONS = 500;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_COMMENT_CHARS = 4000;
const MAX_QUOTE_CHARS = 4000;
const MAX_PATH_CHARS = 4096;
const MAX_CROP_BYTES = 4 * 1024 * 1024;
const CROP_DIR = 'crops';
const CLOSE_UNDO_MS = 10000;
const workspaceWrites = new Map();
const cropGcTimers = new Map();

/** Serialize writes, crop creation and collection for the same real workspace. */
async function withWorkspaceWrite(cwd, job) {
  const key = await fs.realpath(cwd);
  const previous = workspaceWrites.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => job(key));
  workspaceWrites.set(key, next);
  try { return await next; }
  finally { if (workspaceWrites.get(key) === next) workspaceWrites.delete(key); }
}

/** Owned directories only. Cleanup must never follow workspace symlinks. */
async function annotationDir(cwd, create = false, crops = false) {
  let dir = await fs.realpath(cwd);
  for (const part of [STORE_DIR, 'annotations', ...(crops ? [CROP_DIR] : [])]) {
    dir = join(dir, part);
    if (create) await fs.mkdir(dir, { recursive: false }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    let stat;
    try { stat = await fs.lstat(dir); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('annotation directory must not be a symlink');
  }
  return dir;
}

async function readGc(cwd) {
  const dir = await annotationDir(cwd);
  if (!dir) return [];
  const path = join(dir, 'pending-cleanup.json');
  try {
    const stat = await fs.lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('invalid cleanup ledger');
    const raw = JSON.parse(await fs.readFile(path, 'utf8'));
    return Array.isArray(raw) ? raw.filter(item => item && /^[A-Za-z0-9_-]{1,128}$/.test(item.id) && Number.isFinite(item.after)) : [];
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

async function writeGc(cwd, rows) {
  const dir = await annotationDir(cwd, rows.length > 0);
  if (!dir) return;
  const path = join(dir, 'pending-cleanup.json');
  try { if ((await fs.lstat(path)).isSymbolicLink()) throw new Error('invalid cleanup ledger'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!rows.length) { await fs.unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; }); return; }
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temp, JSON.stringify(rows)); await fs.rename(temp, path);
}

/** A durable receipt protects images referenced by messages after notes close. */
async function protectSentCrops(cwd, notes) {
  const dir = await annotationDir(cwd, false, true);
  if (!dir) return;
  for (const note of notes) {
    if (!note.sentAt || !/^[A-Za-z0-9_-]{1,128}$/.test(note.id)) continue;
    try {
      const image = await fs.lstat(join(dir, `${note.id}.png`));
      if (!image.isFile() || image.isSymbolicLink()) continue;
      const handle = await fs.open(join(dir, `${note.id}.sent`), 'wx'); await handle.close();
    } catch (error) { if (!['ENOENT', 'EEXIST'].includes(error.code)) throw error; }
  }
}

function scheduleCropGc(cwd, rows) {
  if (cropGcTimers.has(cwd)) clearTimeout(cropGcTimers.get(cwd));
  cropGcTimers.delete(cwd);
  if (!rows.length) return;
  const timer = setTimeout(() => {
    cropGcTimers.delete(cwd);
    collectCrops(cwd).catch(() => { /* durable candidates retry on the next workspace read/write */ });
  }, Math.max(1, Math.min(...rows.map(item => item.after)) - Date.now()));
  timer.unref?.(); cropGcTimers.set(cwd, timer);
}

async function collectCrops(cwd, now = Date.now()) {
  return withWorkspaceWrite(cwd, async realCwd => {
    const rows = await readGc(realCwd);
    const notes = (await readStoreRaw(realCwd)).annotations;
    const live = new Set(notes.map(note => note.id));
    await protectSentCrops(realCwd, notes);
    const dir = await annotationDir(realCwd, false, true), keep = [], removed = [];
    for (const row of rows) {
      if (live.has(row.id)) continue; // Undo restored this note.
      if (row.after > now) { keep.push(row); continue; }
      if (!dir) continue;
      try { await fs.lstat(join(dir, `${row.id}.sent`)); continue; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      const image = join(dir, `${row.id}.png`);
      try {
        const stat = await fs.lstat(image);
        if (!stat.isFile() || stat.isSymbolicLink()) continue;
        await fs.unlink(image); removed.push(row.id);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    await writeGc(realCwd, keep); scheduleCropGc(realCwd, keep);
    return removed;
  });
}

/** Read an optional service without making it a hard dependency. */
function safeGet(ctx, name) {
  try {
    return typeof ctx.get === 'function' ? ctx.get(name) : undefined;
  } catch {
    return undefined;
  }
}

/** JSON response with caching disabled. */
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** Typed failure the browser half can branch on (it never parses messages). */
function fail(code, message, status = 400) {
  return json({ ok: false, error: { code, message } }, status);
}

/**
 * Validate a client-supplied workspace root.
 * @param value - candidate `cwd`.
 * @returns resolved absolute path, or null when unusable.
 */
async function validateCwd(value) {
  if (typeof value !== 'string' || value === '' || value.length > MAX_PATH_CHARS) return null;
  if (!isAbsolute(value)) return null;
  const resolved = resolve(value);
  try {
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) return null;
  } catch {
    return null;
  }
  return resolved;
}

/** `<cwd>/.dsh/annotations.json`. */
function storePathFor(cwd) {
  return join(cwd, STORE_DIR, STORE_FILE);
}

/** Trim and bound one optional string field. */
function bounded(value, max, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  return text.length > max ? text.slice(0, max) : text;
}

/**
 * Shape one annotation record for disk: unknown fields are dropped, every
 * identity field is bounded, timestamps stay integers.
 */
function normalizeRecord(raw) {
  if (typeof raw !== 'object' || raw === null) return null;
  const id = bounded(raw.id, 128);
  const path = bounded(raw.path, MAX_PATH_CHARS);
  if (id === '' || path === '') return null;
  const record = {
    id,
    path,
    rel: bounded(raw.rel, MAX_PATH_CHARS),
    // v2: the Session that wrote the note. Empty string means "unknown/legacy" —
    // the browser half keeps those out of a Session's own view but never drops them.
    sessionId: bounded(raw.sessionId, 128),
    quote: bounded(raw.quote, MAX_QUOTE_CHARS),
    comment: bounded(raw.comment, MAX_COMMENT_CHARS),
    createdAt: Number.isFinite(raw.createdAt) ? Math.floor(raw.createdAt) : Date.now(),
  };
  const region = normalizeRegion(raw.region);
  if (region) record.region = region;
  const anchor = normalizeTextAnchor(raw.anchor);
  if (anchor) record.anchor = anchor;
  const htmlAnchor = normalizeHtmlAnchor(raw.htmlAnchor);
  if (htmlAnchor) record.htmlAnchor = htmlAnchor;
  const crop = bounded(raw.crop, MAX_PATH_CHARS);
  if (crop) record.crop = crop;
  if (Number.isFinite(raw.sentAt)) record.sentAt = Math.floor(raw.sentAt);
  if (raw.detached === true) record.detached = true;
  return record;
}

function normalizeTextAnchor(raw) {
  if (!raw || !Number.isInteger(raw.start) || !Number.isInteger(raw.end)
      || raw.start < 0 || raw.end <= raw.start || raw.end > 10000000) return null;
  const anchor = { start: raw.start, end: raw.end,
    prefix: typeof raw.prefix === 'string' ? raw.prefix.slice(-96) : '',
    suffix: typeof raw.suffix === 'string' ? raw.suffix.slice(0, 96) : '' };
  if (Number.isInteger(raw.page) && raw.page > 0) anchor.page = raw.page;
  return anchor;
}

function normalizeHtmlAnchor(raw) {
  if (!raw || !['text', 'element', 'region'].includes(raw.kind)
      || typeof raw.selector !== 'string' || !raw.selector.trim() || raw.selector.length > 2048) return null;
  const result = { version: 1, kind: raw.kind, selector: raw.selector.trim(),
    tag: typeof raw.tag === 'string' ? raw.tag.slice(0, 64) : '',
    text: typeof raw.text === 'string' ? raw.text.slice(0, 256) : '' };
  if (raw.kind === 'text') {
    const textAnchor = normalizeTextAnchor(raw);
    if (!textAnchor) return null;
    Object.assign(result, textAnchor);
  }
  return result;
}

/**
 * A boxed region on a page/image, stored normalized to its carrier so the note
 * survives zoom, scroll and a different window size.
 */
function normalizeRegion(raw) {
  if (typeof raw !== 'object' || raw === null) return null;
  const kind = raw.kind === 'pdf' ? 'pdf' : raw.kind === 'image' ? 'image' : raw.kind === 'html' ? 'html' : null;
  if (kind === null) return null;
  const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null);
  const x = num(raw.x);
  const y = num(raw.y);
  const w = num(raw.w);
  const h = num(raw.h);
  if (x === null || y === null || w === null || h === null) return null;
  if (w <= 0 || h <= 0) return null;
  const region = { kind, x, y, w, h };
  if (kind === 'pdf' || kind === 'html') {
    const page = Number.isFinite(raw.page) ? Math.max(1, Math.floor(raw.page)) : 1;
    region.page = page;
  }
  return region;
}

/** Normalize a whole batch, de-duplicating by id and bounding the count. */
function normalizeRecords(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const record = normalizeRecord(item);
    if (record === null || seen.has(record.id)) continue;
    seen.add(record.id);
    out.push(record);
    if (out.length >= MAX_ANNOTATIONS) break;
  }
  return out;
}

/** Read the stored batch; a missing or malformed file reads as empty. */
async function readStoreRaw(cwd) {
  const path = storePathFor(cwd);
  let text;
  try {
    text = await fs.readFile(path, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return { path, annotations: [] };
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { path, annotations: [], malformed: true };
  }
  const annotations = normalizeRecords(parsed && parsed.annotations);
  const version = parsed && Number.isFinite(parsed.version) ? parsed.version : 1;
  return { path, annotations, version };
}

async function readStore(cwd) {
  const value = await readStoreRaw(cwd);
  try { const key = await fs.realpath(cwd); scheduleCropGc(key, await readGc(key)); } catch { /* reading notes remains available */ }
  return value;
}

/** Replace the stored batch atomically (temp file + rename in the same dir). */
async function writeStore(cwd, annotations, protectedCropIds = [], removedCropIds = []) {
  return withWorkspaceWrite(cwd, async cwd => {
    const path = storePathFor(cwd);
    const records = normalizeRecords(annotations);
    const body = `${JSON.stringify({ version: 2, updatedAt: Date.now(), annotations: records }, null, 2)}\n`;
    const bytes = Buffer.byteLength(body, 'utf8');
    if (bytes > MAX_BODY_BYTES) {
      throw new Error(`annotations payload too large (${bytes} > ${MAX_BODY_BYTES})`);
    }
    const before = (await readStoreRaw(cwd)).annotations;
    await protectSentCrops(cwd, [...before, ...records, ...protectedCropIds.map(id => ({id,sentAt:Date.now()}))]);
    const live = new Set(records.map(note => note.id));
    const pending = new Map((await readGc(cwd)).filter(row => !live.has(row.id)).map(row => [row.id, row]));
    const removed = new Set(removedCropIds);
    for (const note of before) if (removed.has(note.id) && !live.has(note.id) && !note.sentAt && /^[A-Za-z0-9_-]{1,128}$/.test(note.id)) {
      pending.set(note.id, { id: note.id, after: Date.now() + CLOSE_UNDO_MS });
    }
    await writeGc(cwd, [...pending.values()]);
    await fs.mkdir(dirname(path), { recursive: true });
    const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(temp, body, 'utf8');
    await fs.rename(temp, path);
    scheduleCropGc(cwd, [...pending.values()]);
    return { path, count: records.length, bytes };
  });
}

/** Read one request body with an explicit byte ceiling. */
async function readJson(request) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { error: fail('body-too-large', `request body exceeds ${MAX_BODY_BYTES} bytes`, 413) };
  }
  let text;
  try {
    text = await request.text();
  } catch {
    return { error: fail('body-unreadable', 'request body could not be read') };
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    return { error: fail('body-too-large', `request body exceeds ${MAX_BODY_BYTES} bytes`, 413) };
  }
  let value;
  try {
    value = text === '' ? {} : JSON.parse(text);
  } catch {
    return { error: fail('body-invalid', 'request body is not JSON') };
  }
  if (typeof value !== 'object' || value === null) {
    return { error: fail('body-invalid', 'request body must be a JSON object') };
  }
  return { value };
}

/** Shared preamble: parse the body and resolve the workspace root. */
async function contextOf(request) {
  const parsed = await readJson(request);
  if (parsed.error) return parsed;
  const cwd = await validateCwd(parsed.value.cwd);
  if (cwd === null) {
    return { error: fail('cwd-invalid', 'cwd must be an absolute path to an existing directory') };
  }
  return { cwd, body: parsed.value };
}

/** `POST read` — return the stored batch for one workspace. */
async function readResponse(request) {
  const context = await contextOf(request);
  if (context.error) return context.error;
  try {
    const stored = await readStore(context.cwd);
    return json({
      ok: true,
      value: {
        path: stored.path,
        annotations: stored.annotations,
        version: stored.version ?? 1,
        malformed: stored.malformed === true
      },
    });
  } catch (error) {
    return fail('store-read-failed', String(error && error.message ? error.message : error), 500);
  }
}

/** `POST write` — replace the stored batch for one workspace. */
async function writeResponse(request) {
  const context = await contextOf(request);
  if (context.error) return context.error;
  if (!Array.isArray(context.body.annotations)) {
    return fail('annotations-invalid', 'annotations must be an array');
  }
  try {
    const cropIds = value => Array.isArray(value)
      ? value.filter(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id)).slice(0, MAX_ANNOTATIONS) : [];
    const written = await writeStore(context.cwd, context.body.annotations,
      cropIds(context.body.protectedCropIds), cropIds(context.body.removedCropIds));
    return json({ ok: true, value: written });
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    const status = /too large/.test(message) ? 413 : 500;
    return fail('store-write-failed', message, status);
  }
}

/**
 * Resolve one Session's workspace root on the Host, where the truth lives.
 *
 * The browser half must not guess this (a preview can be opened from a chat link or
 * a deliverable card without ever mounting the file tree), and it must not call
 * React hooks conditionally to read the Session store — that is what crashed the
 * preview header with React #311. So the client asks this route and caches the answer.
 *
 * @param sessionId - Session id from the slot props.
 * @param deps - `{ sessions, sessionQuery }`, either may be missing.
 * @returns `{ cwd, source }` or null.
 */
async function resolveSessionCwd(sessionId, deps) {
  if (typeof sessionId !== 'string' || sessionId === '') return null;
  const sessions = deps && deps.sessions;
  if (sessions && typeof sessions.get === 'function') {
    try {
      const session = sessions.get(sessionId);
      const cwd = session && session.header && session.header.cwd;
      if (typeof cwd === 'string' && cwd) return { cwd, source: 'live' };
    } catch {
      /* fall through to the cold path */
    }
  }
  const query = deps && deps.sessionQuery;
  if (query && typeof query.observeSession === 'function') {
    let handle = null;
    try {
      handle = await query.observeSession(sessionId, { projectionMode: 'none' });
      const cwd = handle && handle.header && handle.header.cwd;
      if (typeof cwd === 'string' && cwd) return { cwd, source: 'cold' };
    } catch {
      /* unknown session */
    } finally {
      if (handle) {
        try {
          const dispose = handle[Symbol.asyncDispose] || handle[Symbol.dispose];
          if (typeof dispose === 'function') await dispose.call(handle);
        } catch {
          /* a leaked lease is worse than a failed dispose? no: keep quiet, the GC boundary owns it */
        }
      }
    }
  }
  return null;
}

/** `POST resolve` — answer the workspace root for one Session. */
async function resolveResponse(request, deps) {
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const sessionId = parsed.value && parsed.value.sessionId;
  let resolved;
  try {
    resolved = await resolveSessionCwd(sessionId, deps);
  } catch (error) {
    return fail('resolve-failed', String(error && error.message ? error.message : error), 500);
  }
  if (resolved === null) return fail('session-unknown', 'no workspace root for this session', 404);
  const cwd = await validateCwd(resolved.cwd);
  if (cwd === null) return fail('cwd-invalid', 'session workspace is not an existing directory', 409);
  return json({ ok: true, value: { cwd, source: resolved.source } });
}

/**
 * Persist one region crop. The browser half draws the boxed area of a PDF page or
 * an image into a canvas and posts the PNG here, so the prompt can point the agent
 * at a file it can actually open.
 *
 * @param cwd - workspace root (already validated).
 * @param id - annotation id; also the file name stem.
 * @param dataUrl - `data:image/png;base64,...`.
 */
async function writeCrop(cwd, id, dataUrl, requireRecord = false) {
  return withWorkspaceWrite(cwd, async cwd => {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
      throw Object.assign(new Error('crop id must be [A-Za-z0-9_-]{1,128}'), { code: 'crop-id-invalid' });
    }
    if (typeof dataUrl !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
      throw Object.assign(new Error('crop must be a base64 PNG data URL'), { code: 'crop-invalid' });
    }
    const base64 = dataUrl.slice('data:image/png;base64,'.length);
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length === 0 || bytes.length > MAX_CROP_BYTES) {
      throw Object.assign(new Error(`crop must be 1..${MAX_CROP_BYTES} bytes`), { code: 'crop-too-large' });
    }
    if (!(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)) {
      throw Object.assign(new Error('crop bytes are not a PNG'), { code: 'crop-invalid' });
    }
    const notes = requireRecord ? (await readStoreRaw(cwd)).annotations : [];
    if (requireRecord && !notes.some(note => note.id === id)) throw Object.assign(new Error('annotation already closed'), {code:'annotation-closed'});
    const dir = await annotationDir(cwd, true, true);
    const file = join(dir, `${id}.png`);
    try { if ((await fs.lstat(file)).isSymbolicLink()) throw new Error('crop must not be a symlink'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.writeFile(file, bytes);
    if (requireRecord) await protectSentCrops(cwd, notes.filter(note => note.id === id));
    const rel = posix.join(STORE_DIR, STORE_FILE.replace(/\.json$/, ''), CROP_DIR, `${id}.png`);
    return { path: file, rel, bytes: bytes.length };
  });
}

/** `POST crop` — store one region crop and answer its workspace-relative path. */
async function cropResponse(request) {
  const context = await contextOf(request);
  if (context.error) return context.error;
  try {
    const written = await writeCrop(context.cwd, context.body.id, context.body.dataUrl, true);
    return json({ ok: true, value: { path: written.path, rel: written.rel, bytes: written.bytes } });
  } catch (error) {
    const code = (error && error.code) || 'crop-write-failed';
    const status = code === 'crop-too-large' ? 413 : code === 'crop-write-failed' ? 500 : 400;
    return fail(code, String(error && error.message ? error.message : error), status);
  }
}

/** Read only the fixed crop owned by an annotation, never a client-supplied path. */
async function cropPreviewResponse(request) {
  const context = await contextOf(request);
  if (context.error) return context.error;
  const id = context.body.id;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return fail('crop-id-invalid', 'invalid crop id');
  const file = join(context.cwd, STORE_DIR, 'annotations', CROP_DIR, `${id}.png`);
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_CROP_BYTES) return fail('crop-invalid', 'not a valid crop');
    const directory = await fs.realpath(dirname(file));
    const root = await fs.realpath(context.cwd);
    const rel = relative(root, directory);
    if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) return fail('crop-invalid', 'crop outside workspace');
    const bytes = await fs.readFile(file);
    if (bytes.length < 8 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return fail('crop-invalid', 'not a PNG');
    return json({ ok: true, value: { dataUrl: `data:image/png;base64,${bytes.toString('base64')}` } });
  } catch (error) {
    return fail('crop-read-failed', 'crop unavailable', error?.code === 'ENOENT' ? 404 : 500);
  }
}

/**
 * Mount the routes. `connection` is a Web-surface capability that the server
 * provides *after* bundle plugins apply, so it is awaited with `ctx.inject`
 * instead of sampled once (a one-shot `ctx.get` registers nothing and every
 * request would 404).
 */
export function apply(ctx) {
  /** Session cwd resolution services; both are optional, so read them lazily. */
  const resolveDeps = () => ({
    sessions: safeGet(ctx, 'sessions'),
    sessionQuery: safeGet(ctx, 'sessionQuery'),
  });

  ctx.inject(['connection'], (scope) => {
    scope.effect(() => scope.connection.fetch.register({ path: CROP_PREVIEW_ROUTE, methods: ['POST'], requestBody: 'buffered',
      fetch: cropPreviewResponse }), 'file-annotations: crop preview route');
    scope.effect(
      () =>
        scope.connection.fetch.register({
          path: RESOLVE_ROUTE,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: (request) => resolveResponse(request, resolveDeps()),
        }),
      'file-annotations: resolve route',
    );
    scope.effect(
      () =>
        scope.connection.fetch.register({
          path: CROP_ROUTE,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: (request) => cropResponse(request),
        }),
      'file-annotations: crop route',
    );
    scope.effect(
      () =>
        scope.connection.fetch.register({
          path: READ_ROUTE,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: (request) => readResponse(request),
        }),
      'file-annotations: read route',
    );
    scope.effect(
      () =>
        scope.connection.fetch.register({
          path: WRITE_ROUTE,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: (request) => writeResponse(request),
        }),
      'file-annotations: write route',
    );
  });
}

/** Exposed for `test/host.test.mjs`; the Cordis loader ignores extra exports. */
export const __internals = {
  RESOLVE_ROUTE,
  CROP_ROUTE,
  CROP_PREVIEW_ROUTE,
  READ_ROUTE,
  WRITE_ROUTE,
  STORE_DIR,
  STORE_FILE,
  MAX_ANNOTATIONS,
  MAX_BODY_BYTES,
  validateCwd,
  normalizeRecord,
  normalizeRecords,
  normalizeHtmlAnchor,
  storePathFor,
  readStore,
  writeStore,
  readResponse,
  writeResponse,
  resolveSessionCwd,
  resolveResponse,
  normalizeRegion,
  writeCrop,
  cropResponse,
  cropPreviewResponse,
  collectCrops,
};

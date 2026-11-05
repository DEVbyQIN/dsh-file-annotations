// dsh-file-annotations — host-half self test.
//
// Exercises the real persistence module against a real temporary workspace:
// validation, the atomic write, the read/write routes, and every refusal the
// browser half can hit. No DSH process needed.
//
// Run: node --test test/host.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const host = await import('../index.mjs');
const I = host.__internals;

async function workspace() {
  return mkdtemp(join(tmpdir(), 'dsh-file-annotations-'));
}

function request(body, method = 'POST') {
  return new Request('http://127.0.0.1/api/dsh-file-annotations/read', {
    method,
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

async function payload(response) {
  return JSON.parse(await response.text());
}

test('plugin exports the Cordis contract shape', () => {
  assert.equal(host.name, 'dsh-file-annotations');
  assert.ok(Array.isArray(host.inject));
  assert.equal(typeof host.apply, 'function');
  assert.equal(host.default, undefined, 'a default export would replace the plugin object');
});

test('validateCwd accepts only existing absolute directories', async () => {
  const root = await workspace();
  try {
    assert.equal(await I.validateCwd(root), root);
    assert.equal(await I.validateCwd('relative/path'), null);
    assert.equal(await I.validateCwd(''), null);
    assert.equal(await I.validateCwd(null), null);
    assert.equal(await I.validateCwd(join(root, 'missing')), null);
    await writeFile(join(root, 'file.txt'), 'x');
    assert.equal(await I.validateCwd(join(root, 'file.txt')), null, 'a file is not a workspace');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('store path is exactly <cwd>/.dsh/annotations.json', async () => {
  const root = await workspace();
  try {
    assert.equal(I.storePathFor(root), join(root, '.dsh', 'annotations.json'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('normalizeRecord bounds fields and drops identityless records', () => {
  assert.equal(I.normalizeRecord(null), null);
  assert.equal(I.normalizeRecord({ id: '', path: '/w/a.ts' }), null);
  assert.equal(I.normalizeRecord({ id: 'a', path: '' }), null);
  const record = I.normalizeRecord({
    id: 'a1',
    path: '/w/a.ts',
    rel: 'a.ts',
    quote: 'q'.repeat(9000),
    comment: 'c'.repeat(9000),
    createdAt: 1.9,
    unknownField: 'dropped'
  });
  assert.equal(record.quote.length, 4000);
  assert.equal(record.comment.length, 4000);
  assert.equal(record.createdAt, 1);
  assert.equal('unknownField' in record, false);
});

test('text anchor context and PDF page survive Host normalization', () => {
  const record = I.normalizeRecord({ id: 'anchored', path: '/w/a.pdf', quote: '静电场',
    anchor: { start: 100, end: 103, page: 4, prefix: '第三章', suffix: '课程说明' } });
  assert.deepEqual(record.anchor, { start: 100, end: 103, page: 4, prefix: '第三章', suffix: '课程说明' });
  assert.equal(I.normalizeRecord({ id: 'bad', path: '/w/a', anchor: { start: -1, end: 3 } }).anchor, undefined);
});

test('removed-from-message state survives Host storage and does not pretend to be sent', async () => {
  const root = await workspace();
  try {
    const note = { id: 'removed', path: join(root, 'review.txt'), sessionId: 's', comment: 'kept in history', detached: true };
    await I.writeStore(root, [note]);
    const read = await I.readStore(root);
    assert.equal(read.annotations[0].detached, true);
    assert.equal(read.annotations[0].sentAt, undefined);
    assert.equal(I.normalizeRecord({ ...note, detached: 'true' }).detached, undefined);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('normalizeRecords de-duplicates ids and caps the batch', () => {
  const many = Array.from({ length: 600 }, (_, index) => ({ id: `id-${index}`, path: `/w/f${index}.ts` }));
  const records = I.normalizeRecords([...many, { id: 'id-0', path: '/w/dup.ts' }]);
  assert.equal(records.length, I.MAX_ANNOTATIONS);
  assert.equal(new Set(records.map((record) => record.id)).size, I.MAX_ANNOTATIONS);
});

test('write then read round-trips through the real file system', async () => {
  const root = await workspace();
  try {
    const written = await I.writeStore(root, [
      { id: 'a1', path: join(root, 'a.ts'), rel: 'a.ts', quote: 'const x = 1', comment: '这里要加校验' }
    ]);
    assert.equal(written.count, 1);
    const onDisk = await readFile(join(root, '.dsh', 'annotations.json'), 'utf8');
    assert.match(onDisk, /这里要加校验/);
    const stored = await I.readStore(root);
    assert.equal(stored.annotations.length, 1);
    assert.equal(stored.annotations[0].rel, 'a.ts');
    assert.equal(stored.malformed, undefined);
    const leftovers = (await readdir(join(root, '.dsh'))).filter((name) => name.includes('.tmp-'));
    assert.deepEqual(leftovers, [], 'the temp file is renamed away, never left behind');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a missing store reads as empty and a corrupt store is flagged', async () => {
  const root = await workspace();
  try {
    const missing = await I.readStore(root);
    assert.deepEqual(missing.annotations, []);
    await mkdir(join(root, '.dsh'), { recursive: true });
    await writeFile(join(root, '.dsh', 'annotations.json'), '{not json');
    const corrupt = await I.readStore(root);
    assert.deepEqual(corrupt.annotations, []);
    assert.equal(corrupt.malformed, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the read route answers with the stored batch', async () => {
  const root = await workspace();
  try {
    await I.writeStore(root, [{ id: 'a1', path: join(root, 'a.ts'), comment: 'c' }]);
    const response = await I.readResponse(request({ cwd: root }));
    assert.equal(response.status, 200);
    const body = await payload(response);
    assert.equal(body.ok, true);
    assert.equal(body.value.annotations.length, 1);
    assert.equal(body.value.path, join(root, '.dsh', 'annotations.json'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the write route replaces the whole batch', async () => {
  const root = await workspace();
  try {
    await I.writeStore(root, [{ id: 'old', path: join(root, 'old.ts'), comment: 'old' }]);
    const response = await I.writeResponse(request({
      cwd: root,
      annotations: [{ id: 'new', path: join(root, 'new.ts'), comment: 'new' }]
    }));
    assert.equal(response.status, 200);
    const stored = await I.readStore(root);
    assert.equal(stored.annotations.length, 1);
    assert.equal(stored.annotations[0].id, 'new');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('bad requests fail closed with typed codes', async () => {
  const root = await workspace();
  try {
    const noCwd = await I.readResponse(request({}));
    assert.equal(noCwd.status, 400);
    assert.equal((await payload(noCwd)).error.code, 'cwd-invalid');

    const relative = await I.writeResponse(request({ cwd: 'relative', annotations: [] }));
    assert.equal((await payload(relative)).error.code, 'cwd-invalid');

    const notJson = await I.readResponse(request('{oops'));
    assert.equal((await payload(notJson)).error.code, 'body-invalid');

    const notArray = await I.writeResponse(request({ cwd: root, annotations: 'nope' }));
    assert.equal((await payload(notArray)).error.code, 'annotations-invalid');

    const tooBig = await I.readResponse(new Request('http://127.0.0.1/api/dsh-file-annotations/read', {
      method: 'POST',
      headers: { 'content-length': String(I.MAX_BODY_BYTES + 1) },
      body: '{}'
    }));
    assert.equal(tooBig.status, 413);
    assert.equal((await payload(tooBig)).error.code, 'body-too-large');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('apply waits for the connection service and registers every POST route', () => {
  const registered = [];
  const effects = [];
  const contexts = [];
  const ctx = {
    inject(deps, callback) {
      assert.deepEqual(deps, ['connection'], 'connection is awaited, never sampled once');
      const scope = {
        connection: {
          fetch: {
            register(definition) {
              registered.push(definition);
              return () => {};
            }
          }
        },
        effect(fn, label) {
          effects.push(label);
          return fn();
        }
      };
      contexts.push(scope);
      callback(scope);
    }
  };
  host.apply(ctx);
  assert.equal(registered.length, 5);
  assert.deepEqual(registered.map((route) => route.path).sort(), [I.CROP_PREVIEW_ROUTE, I.CROP_ROUTE, I.READ_ROUTE, I.RESOLVE_ROUTE, I.WRITE_ROUTE].sort());
  for (const route of registered) {
    assert.deepEqual(route.methods, ['POST']);
    assert.equal(route.requestBody, 'buffered');
    assert.equal(typeof route.fetch, 'function');
  }
  assert.equal(effects.length, 5, 'each route owns a disposable effect');
});

test('the resolve route answers with the Session workspace root', async () => {
  const root = await workspace();
  try {
    const deps = {
      sessions: { get: (id) => (id === 'session-1' ? { header: { cwd: root } } : undefined) },
      sessionQuery: { observeSession: async () => { throw new Error('should not be needed'); } }
    };
    const response = await I.resolveResponse(request({ sessionId: 'session-1' }), deps);
    assert.equal(response.status, 200);
    const body = await payload(response);
    assert.equal(body.value.cwd, root);
    assert.equal(body.value.source, 'live');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the resolve route falls back to the cold session query and disposes it', async () => {
  const root = await workspace();
  const calls = { disposed: 0, observed: 0 };
  try {
    const handle = {
      header: { cwd: root },
      [Symbol.asyncDispose]: async () => { calls.disposed += 1; }
    };
    const deps = {
      sessions: { get: () => undefined },
      sessionQuery: {
        observeSession: async (id) => { calls.observed += 1; assert.equal(id, 'cold-1'); return handle; }
      }
    };
    const response = await I.resolveResponse(request({ sessionId: 'cold-1' }), deps);
    assert.equal(response.status, 200);
    assert.equal((await payload(response)).value.source, 'cold');
    assert.equal(calls.observed, 1);
    assert.equal(calls.disposed, 1, 'the observation lease is released');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the resolve route fails closed for unknown sessions and bad workspaces', async () => {
  const unknown = await I.resolveResponse(request({ sessionId: 'nope' }), {
    sessions: { get: () => undefined },
    sessionQuery: { observeSession: async () => { throw new Error('SessionFormatUnsupported'); } }
  });
  assert.equal(unknown.status, 404);
  assert.equal((await payload(unknown)).error.code, 'session-unknown');

  const missing = await I.resolveResponse(request({}), {});
  assert.equal(missing.status, 404);

  const gone = await I.resolveResponse(request({ sessionId: 'ghost' }), {
    sessions: { get: () => ({ header: { cwd: '/definitely/not/here' } }) }
  });
  assert.equal(gone.status, 409);
  assert.equal((await payload(gone)).error.code, 'cwd-invalid');
});

test('region records are clamped, typed and default to page 1', () => {
  const pdf = I.normalizeRegion({ kind: 'pdf', page: 3, x: 0.2, y: 0.3, w: 0.4, h: 0.1 });
  assert.deepEqual({ ...pdf }, { kind: 'pdf', page: 3, x: 0.2, y: 0.3, w: 0.4, h: 0.1 });
  const image = I.normalizeRegion({ kind: 'image', x: 0, y: 0, w: 1, h: 1 });
  assert.equal(image.page, undefined, 'an image has no page');
  const clamped = I.normalizeRegion({ kind: 'html', page: -4, x: -1, y: 2, w: 0.5, h: 0.5 });
  assert.equal(clamped.page, 1);
  assert.equal(clamped.x, 0);
  assert.equal(clamped.y, 1);
  assert.equal(I.normalizeRegion({ kind: 'nope', x: 0, y: 0, w: 1, h: 1 }), null);
  assert.equal(I.normalizeRegion({ kind: 'pdf', x: 0, y: 0, w: 0, h: 1 }), null, 'an empty box is not a region');
  assert.equal(I.normalizeRegion(null), null);
});

test('the crop route stores one PNG and answers its workspace-relative path', async () => {
  const root = await workspace();
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PzWvWQAAAABJRU5ErkJggg==';
  try {
    await I.writeStore(root,[{id:'abc123',path:join(root,'a.pdf'),comment:'box'}]);
    const response = await I.cropResponse(request({
      cwd: root,
      id: 'abc123',
      dataUrl: `data:image/png;base64,${png}`
    }));
    assert.equal(response.status, 200);
    const body = await payload(response);
    assert.equal(body.value.rel, '.dsh/annotations/crops/abc123.png');
    const bytes = await readFile(join(root, '.dsh', 'annotations', 'crops', 'abc123.png'));
    assert.ok(bytes.length > 8);
    assert.equal(bytes[0], 0x89);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the crop route refuses bad ids, bad payloads and non-PNG bytes', async () => {
  const root = await workspace();
  try {
    const badId = await I.cropResponse(request({ cwd: root, id: '../escape', dataUrl: 'data:image/png;base64,AAAA' }));
    assert.equal(badId.status, 400);
    assert.equal((await payload(badId)).error.code, 'crop-id-invalid', 'path traversal never reaches the fs');

    const notImage = await I.cropResponse(request({ cwd: root, id: 'ok', dataUrl: 'data:text/plain;base64,AAAA' }));
    assert.equal((await payload(notImage)).error.code, 'crop-invalid');

    const notPng = await I.cropResponse(request({ cwd: root, id: 'ok2', dataUrl: 'data:image/png;base64,QUJD' }));
    assert.equal((await payload(notPng)).error.code, 'crop-invalid', 'the magic bytes are checked');

    const noCwd = await I.cropResponse(request({ id: 'ok3', dataUrl: 'data:image/png;base64,AAAA' }));
    assert.equal((await payload(noCwd)).error.code, 'cwd-invalid');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('route paths are document-relative and distinct', () => {
  assert.equal(I.RESOLVE_ROUTE, '/api/dsh-file-annotations/resolve');
  assert.equal(I.CROP_ROUTE, '/api/dsh-file-annotations/crop');
  assert.equal(I.READ_ROUTE, '/api/dsh-file-annotations/read');
  assert.equal(I.WRITE_ROUTE, '/api/dsh-file-annotations/write');
  assert.notEqual(I.READ_ROUTE, I.WRITE_ROUTE);
  assert.notEqual(I.RESOLVE_ROUTE, I.READ_ROUTE);
});

test('crop preview reads the saved PNG without accepting arbitrary filenames', async () => {
  const root = await workspace();
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PzWvWQAAAABJRU5ErkJggg==';
  try {
    await I.writeCrop(root, 'preview1', `data:image/png;base64,${png}`);
    const response = await I.cropPreviewResponse(request({ cwd: root, id: 'preview1' }));
    assert.equal(response.status, 200);
    assert.equal((await payload(response)).value.dataUrl, `data:image/png;base64,${png}`);
    const invalid = await I.cropPreviewResponse(request({ cwd: root, id: '../escape' }));
    assert.equal(invalid.status, 400);
    const missing = await I.cropPreviewResponse(request({ cwd: root, id: 'missing' }));
    assert.equal(missing.status, 404);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('HTML element and text anchors round-trip through Host storage with bounded metadata', async () => {
  const root = await workspace();
  try {
    await I.writeStore(root,[{id:'html',path:join(root,'a.html'),sessionId:'s',quote:'Hello',comment:'change',
      htmlAnchor:{kind:'text',selector:'#intro',tag:'p',text:'Hello',start:0,end:5,prefix:'',suffix:'next',unknown:'drop'}}]);
    const notes = (await I.readStore(root)).annotations;
    assert.equal(notes[0].htmlAnchor.selector,'#intro'); assert.equal(notes[0].htmlAnchor.end,5);
    assert.equal(notes[0].htmlAnchor.unknown,undefined);
    assert.equal(I.normalizeHtmlAnchor({kind:'element',selector:'x'.repeat(2049)}),null);
    assert.equal(I.normalizeHtmlAnchor({kind:'text',selector:'#x',start:4,end:2}),null);
  } finally {await rm(root,{recursive:true,force:true});}
});

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PzWvWQAAAABJRU5ErkJggg==';

test('close writes really remove JSON records; Undo protects crops, expiry deletes only removed unsent crops', async () => {
  const root=await workspace();
  const note=id=>({id,path:join(root,'a.pdf'),sessionId:'s',comment:id});
  try {
    await I.writeStore(root,[note('undo'),note('gone'),{...note('sent'),sentAt:10}]);
    for(const id of ['undo','gone','sent','unknown']) await I.writeCrop(root,id,TINY_PNG);
    const close = await I.writeResponse(request({ cwd: root, annotations: [], removedCropIds: ['undo','gone','sent'] }));
    assert.equal(close.status, 200);
    assert.deepEqual((await I.readStore(root)).annotations,[]);
    assert.ok((await readdir(join(root,'.dsh/annotations/crops'))).includes('gone.png'),'Undo grace keeps the crop temporarily');
    await I.writeStore(root,[note('undo')]);
    const removed=await I.collectCrops(root,Date.now()+20000);
    assert.deepEqual(removed,['gone']);
    const files=await readdir(join(root,'.dsh/annotations/crops'));
    assert.ok(files.includes('undo.png'));assert.ok(files.includes('sent.png'));assert.ok(files.includes('sent.sent'));
    assert.ok(files.includes('unknown.png'),'unknown pre-existing images are never guessed to be disposable');
    assert.ok(!(await readdir(join(root,'.dsh/annotations'))).includes('pending-cleanup.json'),'empty collection metadata is removed');
  } finally {await rm(root,{recursive:true,force:true});}
});

test('an admission receipt preserves a crop even when close races the sentAt metadata write', async () => {
  const root=await workspace();
  try {
    await I.writeStore(root,[{id:'flight',path:join(root,'a.pdf'),comment:'send'}]);
    await I.writeCrop(root,'flight',TINY_PNG);
    await I.writeStore(root,[],['flight'],['flight']);
    await I.collectCrops(root,Date.now()+20000);
    assert.ok((await readFile(join(root,'.dsh/annotations/crops/flight.png'))).length>0);
    assert.deepEqual((await I.readStore(root)).annotations,[]);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('crop creation after close is refused and cannot resurrect collected image files', async () => {
  const root=await workspace();
  try {
    await I.writeStore(root,[{id:'late',path:join(root,'a.pdf'),comment:'close'}]);await I.writeStore(root,[]);
    const result=await I.cropResponse(request({cwd:root,id:'late',dataUrl:TINY_PNG}));
    assert.equal((await payload(result)).error.code,'annotation-closed');
    await assert.rejects(readFile(join(root,'.dsh/annotations/crops/late.png')),error=>error.code==='ENOENT');
  } finally {await rm(root,{recursive:true,force:true});}
});

test('collection never follows crop symlinks or accepts foreign filenames', {skip:process.platform === 'win32'}, async () => {
  const root=await workspace(),outside=await workspace();
  try {
    await I.writeStore(root,[{id:'link',path:join(root,'a.pdf'),comment:'c'}]);await I.writeCrop(root,'link',TINY_PNG);
    const crop=join(root,'.dsh/annotations/crops/link.png');await rm(crop);await writeFile(join(outside,'keep.png'),'keep');
    await symlink(join(outside,'keep.png'),crop);await I.writeStore(root,[],[],['link']);await I.collectCrops(root,Date.now()+20000);
    assert.equal(await readFile(join(outside,'keep.png'),'utf8'),'keep');
    await assert.rejects(I.writeCrop(root,'../keep',TINY_PNG));
    await assert.rejects(I.writeCrop(root,'link',TINY_PNG));
  } finally {await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});

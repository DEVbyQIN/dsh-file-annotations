// dsh-file-annotations — browser-half self test.
//
// Loads the REAL lib/client.js through the real `window.__ModuleLoader__.load`
// registration path on a minimal DOM stub. No renderer, no bundler: the point is
// to pin the module contract, the prompt builder, the store round trip, the
// composer bridge (including its degraded path) and disposal.
//
// Run: node --test test/verify.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(here, '..', 'lib', 'client.js');
const SOURCE = readFileSync(BUNDLE, 'utf8');
const MANIFEST = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
const MARK = 'data-dsh-file-annotations';

/* ── minimal DOM ────────────────────────────────────────────────────────── */

class MockNode {
  constructor(tag) {
    this.nodeType = 1;
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attributes = {};
    this.style = {
      setProperty(name, value) { this[name] = value; },
      removeProperty(name) { delete this[name]; }
    };
    this.listeners = new Map();
    this.parentNode = null;
    this.textContent = '';
    this.value = '';
    this.title = '';
    this.disabled = false;
    this.placeholder = '';
    this.rows = 0;
    this.type = '';
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; }
  removeAttribute(name) { delete this.attributes[name]; }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this; this.children.push(child); return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) { this.children.splice(index, 1); child.parentNode = null; }
    return child;
  }

  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  get parentElement() { return this.parentNode; }
  contains(node) { return node === this || this.children.some((child) => child.contains(node)); }
  get firstChild() { return this.children[0] ?? null; }
  focus() { this.focused = true; }
  click() { this.emit('click'); }
  showModal() { this.open = true; }
  close() { this.open = false; }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }

  removeEventListener(type, fn) {
    const set = this.listeners.get(type);
    if (set) set.delete(fn);
  }

  emit(type, event) {
    const set = this.listeners.get(type);
    const payload = event ?? { preventDefault() {}, stopPropagation() {}, target: this };
    if (set) for (const fn of [...set]) fn(payload);
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, right: 320, bottom: 420, width: 320, height: 420 };
  }

  /** Only the selectors this plugin actually queries are supported. */
  matches(selector) {
    if (selector.includes(',')) return selector.split(',').some((part) => this.matches(part.trim()));
    const descendant = /^(\[[^\]]+\]) (\.[\w-]+)$/.exec(selector);
    if (descendant) return this.matches(descendant[2]) && !!this.parentElement?.closest(descendant[1]);
    if (/^\.[\w-]+$/.test(selector)) return (this.attributes.class || '').split(/\s+/).includes(selector.slice(1));
    const tag = /^[a-z][a-z0-9]*$/i.exec(selector);
    if (tag) return this.tagName === tag[0].toUpperCase();
    const slot = /^\[data-slot="(.+)"\]$/.exec(selector);
    if (slot) return this.attributes['data-slot'] === slot[1];
    const css = /^style\[data-plugin-css="(.+)"\]$/.exec(selector);
    if (css) return this.tagName === 'STYLE' && this.attributes['data-plugin-css'] === css[1];
    const attr = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
    if (attr) return attr[2] === undefined ? this.getAttribute(attr[1]) !== null : this.getAttribute(attr[1]) === attr[2];
    return false;
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (typeof node.matches === 'function' && node.matches(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  querySelector(selector) {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }

  querySelectorAll(selector) {
    const parts = selector.split(',').map((part) => part.trim());
    const out = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (parts.some((part) => child.matches(part))) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }

  /** Depth-first search by our own marker attribute. */
  findByMark(mark) {
    if (this.getAttribute(MARK) === mark) return this;
    for (const child of this.children) {
      const found = child.findByMark(mark);
      if (found) return found;
    }
    return null;
  }
}

function makeDocument() {
  const documentElement = new MockNode('html');
  documentElement.setAttribute('lang', 'zh-CN');
  const head = new MockNode('head');
  const body = new MockNode('body');
  documentElement.appendChild(head);
  documentElement.appendChild(body);

  return {
    documentElement,
    head,
    body,
    _listeners: new Map(),
    createElement: (tag) => new MockNode(tag),
    querySelector(selector) {
      if (documentElement.matches(selector)) return documentElement;
      return documentElement.querySelector(selector);
    },
    querySelectorAll(selector) {
      return documentElement.querySelectorAll(selector);
    },
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      const set = this._listeners.get(type);
      if (set) set.delete(fn);
    },
    listenerCount() {
      let total = 0;
      for (const set of this._listeners.values()) total += set.size;
      return total;
    },
    emit(type, event) {
      const set = this._listeners.get(type);
      if (set) for (const fn of [...set]) fn(event ?? { preventDefault() {}, stopPropagation() {} });
    }
  };
}

function makeLocalStorage() {
  const map = new Map();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); }
  };
}

const reactStub = {
  useState(initial) {
    let value = typeof initial === 'function' ? initial() : initial;
    return [value, (next) => { value = typeof next === 'function' ? next(value) : next; }];
  },
  useEffect() { return undefined; },
  useRef(initial) { return { current: initial ?? null }; },
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children };
  }
};

/**
 * Boot one isolated instance of the browser half.
 * @param options - { fetch, selection, localStorage, language }
 */
function boot(options = {}) {
  const document = makeDocument();
  const windowListeners = new Map();
  const storage = options.localStorage ?? makeLocalStorage();
  const calls = { fetch: [] };

  const window = {
    document,
    innerWidth: 1280,
    innerHeight: 800,
    localStorage: storage,
    location: { href: 'http://127.0.0.1/' },
    requestAnimationFrame: (fn) => { fn(); return 1; },
    cancelAnimationFrame: () => {},
    addEventListener(type, fn) { if (!windowListeners.has(type)) windowListeners.set(type, new Set()); windowListeners.get(type).add(fn); },
    removeEventListener(type, fn) { windowListeners.get(type)?.delete(fn); },
    emit(type, event) { for (const fn of [...(windowListeners.get(type) || [])]) fn(event); },
    getSelection: () => options.selection ?? null,
    fetch: (url, init) => {
      calls.fetch.push({ url, init });
      const handler = options.fetch
        ?? (async () => ({ ok: true, status: 200, json: async () => ({ ok: true, value: { annotations: [] } }) }));
      return handler(url, init);
    }
  };
  if (options.language) document.documentElement.setAttribute('lang', options.language);

  const loaded = [];
  window.__ModuleLoader__ = {
    load({ id, factory }) {
      assert.equal(id, MANIFEST.name, 'loader id must equal the package name');
      loaded.push({
        id,
        exports: factory((name) => {
          assert.equal(name, 'react', 'react is the only required module');
          return options.react ?? reactStub;
        })
      });
    }
  };

  const context = vm.createContext({
    window,
    document,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    JSON,
    Date,
    Math,
    Promise,
    Array,
    Object,
    Set,
    Map,
    Number,
    String,
    Boolean,
    Error,
    RegExp,
    URL,
    fetch: window.fetch
  });
  context.globalThis = context;
  vm.runInContext(SOURCE, context, { filename: 'client.js' });

  const mod = loaded[0].exports;
  mod.__internals.install();
  return { mod, internals: mod.__internals, document, window, storage, calls };
}

/** Mount the browser half with a fake slot registry. */
function mount(booted) {
  const registrations = [];
  const effects = [];
  const ctx = {
    slots: {
      inject(name, callback) {
        return callback();
      },
      register(definition, component) {
        registrations.push({ definition, component });
        return () => {};
      }
    },
    effect(fn, label) {
      effects.push({ fn, label });
      return () => {};
    }
  };
  booted.mod.apply(ctx);
  return { registrations, effects, ctx };
}

function fakeActions(result = true) {
  const calls = { capture: 0, insert: [] };
  return {
    calls,
    captureInsertion() { calls.capture += 1; return { draftRev: 1 }; },
    insertText(text, span) { calls.insert.push({ text, span }); return result; }
  };
}

/* ── module contract ───────────────────────────────────────────────────── */

test('module shape: flat exports, no default, slots injected', () => {
  const booted = boot();
  assert.equal(typeof booted.mod.apply, 'function');
  assert.ok(Array.isArray(booted.mod.inject));
  assert.ok(booted.mod.inject.includes('slots'));
  assert.equal(booted.mod.default, undefined, 'a default export would silently drop inject');
  assert.equal(booted.internals.PKG, MANIFEST.name);
  assert.equal(booted.internals.VERSION, MANIFEST.version, 'the browser half reports the package version');
});

test('apply registers the pending dock and existing slots with one root effect', () => {
  const booted = boot();
  const mounted = mount(booted);
  const names = mounted.registrations.map((entry) => entry.definition.name).sort();
  assert.deepEqual(names, [
    'conversation.input.dock',
    'conversation.input.overlay',
    'sidebar.right.tab.document.actions',
    'sidebar.right.tab.files.actions'
  ]);
  for (const entry of mounted.registrations) {
    assert.equal(typeof entry.component, 'function', `${entry.definition.name} must be a component`);
    assert.equal(typeof entry.definition.id, 'string');
  }
  assert.equal(mounted.effects.length, 1);
  assert.equal(typeof mounted.effects[0].fn(), 'function', 'the effect must return a dispose function');
});

test('install injects exactly one tagged stylesheet and exposes the debug global', () => {
  const booted = boot();
  mount(booted);
  const styles = booted.document.head.children.filter((node) => node.tagName === 'STYLE');
  assert.equal(styles.length, 1);
  assert.equal(styles[0].getAttribute('data-plugin'), MANIFEST.name);
  assert.equal(styles[0].getAttribute('data-plugin-css'), `${MANIFEST.name}/style`);
  assert.equal(booted.window.__dshFileAnnotations.__installed, true);
});

test('stylesheet uses no build-hashed class names and never drags the window', () => {
  const { internals } = boot();
  assert.doesNotMatch(internals.CSS, /\.(Y[A-Za-z0-9]{5,}_|css-[a-z0-9]{5,})/, 'no CSS-module class names');
  assert.match(internals.CSS, /data-dsh-file-annotations/, 'every rule is scoped by our own attribute');
  assert.match(internals.CSS, /-webkit-app-region:no-drag/, 'the desktop floating surface must not drag the window');
  assert.match(internals.CSS, /var\(--dsw-/, 'native theme tokens are used');
});

/* ── data model ────────────────────────────────────────────────────────── */

test('makeRecord rejects empty notes and bounds the quote', () => {
  const { internals } = boot();
  assert.equal(internals.makeRecord({ path: '/w/a.ts', comment: '   ' }), null);
  assert.equal(internals.makeRecord({ path: '', comment: 'x' }), null);
  const record = internals.makeRecord({ path: '/w/a.ts', comment: ' 改一下 ', quote: 'x'.repeat(5000) });
  assert.equal(record.comment, '改一下');
  assert.equal(record.quote.length, 2000);
  assert.equal(typeof record.id, 'string');
});

test('serialize/parse round trip drops foreign and broken records', () => {
  const { internals } = boot();
  const good = { id: 'a1', path: '/w/a.ts', rel: 'a.ts', sessionId: 's1', quote: 'q', comment: 'c', createdAt: 1, sentAt: 2 };
  const list = internals.serializeList([good, null, { id: '', path: '' }, { id: 'a2', path: '/w/b.ts' }]);
  assert.equal(list.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(list[0])), good);
  const parsed = internals.parseList(JSON.stringify({ version: 1, annotations: list }));
  assert.equal(parsed.length, 2);
  assert.equal(internals.parseList('not json').length, 0);
  assert.equal(internals.parseList({ annotations: 'nope' }).length, 0);
});

test('relPathOf trims the workspace root and keeps outsiders intact', () => {
  const { internals } = boot();
  internals.setViewRaw({ cwd: '/w', sessionId: null, file: null, rel: null });
  assert.equal(internals.relPathOf('/w/src/a.ts'), 'src/a.ts');
  assert.equal(internals.relPathOf('/w'), '');
  assert.equal(internals.relPathOf('/elsewhere/a.ts'), '/elsewhere/a.ts');
  assert.equal(internals.dirname('/w/src/a.ts'), '/w/src');
});

/* ── prompt builder ───────────────────────────────────────────────────── */

test('buildPrompt groups by file, numbers notes and skips sent ones', () => {
  const { internals } = boot();
  const prompt = internals.buildPrompt([
    { id: '1', path: '/w/a.ts', rel: 'src/a.ts', quote: 'const x = 1', comment: '这里要校验', createdAt: 1 },
    { id: '2', path: '/w/a.ts', rel: 'src/a.ts', quote: '', comment: '补注释', createdAt: 2 },
    { id: '3', path: '/w/b.md', rel: 'docs/b.md', quote: '', comment: '重写这段', createdAt: 3 },
    { id: '4', path: '/w/a.ts', rel: 'src/a.ts', quote: 'x', comment: '已经发了', createdAt: 4, sentAt: 9 }
  ]);
  assert.match(prompt, /3 条批注/);
  assert.match(prompt, /### src\/a\.ts/);
  assert.match(prompt, /### docs\/b\.md/);
  assert.match(prompt, /【选中】`const x = 1`/);
  assert.match(prompt, /【整文件】/);
  assert.ok(!prompt.includes('已经发了'), 'sent notes never re-enter the prompt');
  assert.ok(!prompt.includes('\n\n\n'), 'no triple blank lines');
  assert.match(prompt, /请以本条消息中的原文、批注和裁剪图为准/);
  assert.doesNotMatch(prompt, /\.dsh\/annotations\.json/, 'messages must not depend on a temporary metadata file after close');
});

test('buildPrompt returns an empty string when nothing is unsent', () => {
  const { internals } = boot();
  assert.equal(internals.buildPrompt([]), '');
  assert.equal(internals.buildPrompt([{ id: '1', path: '/w/a', comment: 'x', sentAt: 5 }]), '');
});

test('multi-line quotes become fenced blocks and truncate', () => {
  const { internals } = boot();
  const quote = Array.from({ length: 20 }, (_, index) => `line ${index}`).join('\n');
  const prompt = internals.buildPrompt([{ id: '1', path: '/w/a.ts', rel: 'a.ts', quote, comment: 'c' }]);
  assert.match(prompt, /```/);
  assert.match(prompt, /已截断/);
});

/* ── composer bridge ───────────────────────────────────────────────────── */

test('the bridge picks the session-matching composer', () => {
  const { internals } = boot();
  internals.setViewRaw({ cwd: '/w', sessionId: 'session-b', file: null, rel: null });
  const first = fakeActions();
  const second = fakeActions();
  internals.registerBridge('el-a', { sessionId: 'session-a', inputActions: first });
  internals.registerBridge('el-b', { sessionId: 'session-b', inputActions: second });
  assert.equal(internals.pickBridge().inputActions, second);
  assert.equal(internals.insertIntoComposer('hello'), true);
  assert.equal(second.calls.capture, 1);
  assert.equal(first.calls.insert.length, 0);
});

test('without a bridge the send path degrades instead of throwing', () => {
  const { internals } = boot();
  internals.setViewRaw({ cwd: '/w', sessionId: 's', file: null, rel: null });
  assert.equal(internals.pickBridge(), null);
  assert.equal(internals.insertIntoComposer('hello'), false);
  assert.equal(internals.insertIntoComposer(''), false, 'empty text never reaches the composer');
});

test('a refused insertion returns false and keeps every note unsent', () => {
  const { internals, window } = boot();
  internals.setViewRaw({ cwd: '/w', sessionId: 's', file: null, rel: null });
  internals.setItems('/w', [{ id: '1', path: '/w/a.ts', comment: 'c', sessionId: 's' }]);
  internals.registerBridge('el', { sessionId: 's', inputActions: fakeActions(false) });
  assert.equal(window.__dshFileAnnotations.send(), false);
  assert.equal(window.__dshFileAnnotations.state().unsent, 1);
});

test('the legacy action never writes a prompt or marks notes sent', () => {
  const { internals, window } = boot();
  internals.setViewRaw({ cwd: '/w', sessionId: 's', file: null, rel: null });
  internals.setItems('/w', [{ id: '1', path: '/w/a.ts', comment: 'c1', sessionId: 's' }]);
  const actions = fakeActions();
  internals.registerBridge('el', { sessionId: 's', inputActions: actions });
  assert.equal(window.__dshFileAnnotations.send(), false, 'no native binding means focus is unavailable');
  assert.equal(actions.calls.insert.length, 0);
  assert.equal(window.__dshFileAnnotations.list()[0].sentAt, undefined);
});

test('a known Session never borrows another Session\'s composer', () => {
  const { internals } = boot();
  internals.setViewRaw({ cwd: '/w', sessionId: 'session-mine', file: null, rel: null });
  internals.registerBridge('el-other', { sessionId: 'session-other', inputActions: fakeActions() });
  assert.equal(internals.pickBridge(), null, 'no cross-conversation writes');
  assert.equal(internals.insertIntoComposer('batch'), false);
});

test('without any known Session the last mounted composer is used', () => {
  const { internals } = boot();
  internals.setViewRaw({ cwd: '/w', sessionId: null, file: null, rel: null });
  const actions = fakeActions();
  internals.registerBridge('el-a', { sessionId: 'session-a', inputActions: actions });
  assert.equal(internals.pickBridge().inputActions, actions);
});

test('the workspace root is never guessed with dirname', () => {
  const { internals } = boot();
  internals.setViewRaw({ cwd: null, sessionId: null, file: null, rel: null });
  assert.equal(internals.cwdForFile('/w/src/a.ts'), null, 'no store inside a subdirectory');
  internals.setViewRaw({ cwd: '/w', sessionId: null, file: null, rel: null });
  assert.equal(internals.cwdForFile('/w/src/a.ts'), '/w', 'a known root that contains the file wins');
  assert.equal(internals.cwdForFile('/elsewhere/a.ts'), null);
});

/* ── slot components: hook order must never depend on props ─────────────── */

/** A React stand-in that records the hook sequence a render produces. */
function hookRecorder() {
  const record = [];
  const react = {
    useState(initial) {
      record.push('useState');
      const value = typeof initial === 'function' ? initial() : initial;
      return [value, () => {}];
    },
    useEffect() { record.push('useEffect'); },
    useRef(initial) { record.push('useRef'); return { current: initial ?? null }; },
    createElement(type, props, ...children) { return { type, props: props ?? {}, children }; }
  };
  return { react, record };
}

/** Render one registered slot component once with the given props. */
function renderEntry(booted, mounted, name, props) {
  const entry = mounted.registrations.find((item) => item.definition.name === name);
  assert.ok(entry, `slot ${name} is registered`);
  return entry.component(props);
}

test('the document header keeps an identical hook order with and without props', () => {
  const { react, record } = hookRecorder();
  const booted = boot({ react });
  const mounted = mount(booted);
  const bare = renderEntry(booted, mounted, 'sidebar.right.tab.document.actions', {});
  const bareHooks = [...record];
  record.length = 0;
  const withFile = renderEntry(booted, mounted, 'sidebar.right.tab.document.actions', {
    absolutePath: '/w/a.ts',
    sessionId: 's1',
    useSessions: () => ({ byId: { s1: { cwd: '/w' } } })
  });
  assert.deepEqual([...record], bareHooks, 'same hooks, same order');
  assert.deepEqual(bareHooks, ['useRef', 'useState', 'useEffect', 'useEffect', 'useEffect', 'useState', 'useEffect']);
  assert.equal(bare.type, 'button');
  assert.equal(withFile.type, 'button');
  assert.equal(bare.props['data-dsh-file-annotations'], 'action');
});

test('the files header keeps an identical hook order with and without props', () => {
  const { react, record } = hookRecorder();
  const booted = boot({ react });
  const mounted = mount(booted);
  renderEntry(booted, mounted, 'sidebar.right.tab.files.actions', {});
  const first = [...record];
  record.length = 0;
  renderEntry(booted, mounted, 'sidebar.right.tab.files.actions', {
    absolutePath: '/w',
    sessionId: 's1',
    useSessions: () => ({ byId: { s1: { cwd: '/w' } } })
  });
  assert.deepEqual([...record], first, 'props never change which hooks run');
  assert.deepEqual(first, ['useRef', 'useState', 'useEffect', 'useEffect', 'useEffect']);
});

test('the composer bridge is also hook-stable', () => {
  const { react, record } = hookRecorder();
  const booted = boot({ react });
  const mounted = mount(booted);
  renderEntry(booted, mounted, 'conversation.input.overlay', {});
  const bare = [...record];
  record.length = 0;
  renderEntry(booted, mounted, 'conversation.input.overlay', { sessionId: 's1', inputActions: fakeActions() });
  assert.deepEqual([...record], bare);
});

test('「全部会话」 is a history view; pending cards remain Session-scoped', () => {
  const { internals } = boot();
  internals.setViewRaw({ cwd: '/w', sessionId: 'session-a', file: null, rel: null });
  internals.setItems('/w', [
    { id: '1', path: '/w/a.ts', comment: 'A 的', sessionId: 'session-a' },
    { id: '2', path: '/w/b.ts', comment: 'B 的', sessionId: 'session-b' }
  ]);
  internals.setScope('all');
  assert.equal(internals.visibleOf('/w').length, 2);
  assert.equal(internals.pendingFor('/w', 'session-a').length, 1);
  assert.equal(internals.pendingFor('/w', 'session-a')[0].comment, 'A 的');
});

test('entry-button counts are scoped to the Session and to unsent', () => {
  const { internals } = boot();
  internals.setItems('/w', [
    { id: '1', path: '/w/a.ts', comment: 'a', sessionId: 'session-a' },
    { id: '2', path: '/w/b.ts', comment: 'b', sessionId: 'session-a', sentAt: 5 },
    { id: '3', path: '/w/c.ts', comment: 'c', sessionId: 'session-b' }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(internals.countsFor('/w', 'session-a'))), { total: 2, unsent: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(internals.countsFor('/w', 'session-b'))), { total: 1, unsent: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(internals.countsFor('/w', 'nobody'))), { total: 0, unsent: 0 });
});

test('the browser half never calls the Session store hook from a conditional', () => {
  assert.doesNotMatch(SOURCE, /useSessions/, 'a prop-gated hook is what crashed the slot with React #311');
});

test('clicking the preview button with no Session flashes instead of guessing', async () => {
  const booted = boot();
  const { internals, document, window } = booted;
  internals.setViewRaw({ cwd: null, sessionId: null, file: null, rel: null });
  const mounted = mount(booted);
  const api = window.__dshFileAnnotations;
  const button = renderEntry(booted, mounted, 'sidebar.right.tab.document.actions', {
    absolutePath: '/w/a.ts'
  });
  button.props.onClick({ preventDefault() {}, stopPropagation() {} });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(api.state().panelOpen, false, 'no panel without a known workspace');
  assert.ok(document.body.findByMark('flash'), 'the user gets told why');
});

test('a preview opened from anywhere else resolves its workspace on the Host', async () => {
  const booted = boot({
    fetch: async (url) => {
      if (url === 'api/dsh-file-annotations/resolve') {
        return { ok: true, status: 200, json: async () => ({ ok: true, value: { cwd: '/w', source: 'live' } }) };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, value: { annotations: [] } }) };
    }
  });
  const { internals, window, calls } = booted;
  internals.setViewRaw({ cwd: null, sessionId: 'session-1', file: null, rel: null });
  const mounted = mount(booted);
  const api = window.__dshFileAnnotations;
  const button = renderEntry(booted, mounted, 'sidebar.right.tab.document.actions', {
    absolutePath: '/w/src/a.ts',
    sessionId: 'session-1'
  });
  button.props.onClick({ preventDefault() {}, stopPropagation() {} });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const resolveCall = calls.fetch.find((call) => call.url === 'api/dsh-file-annotations/resolve');
  assert.ok(resolveCall, 'the client asks the Host instead of guessing');
  assert.equal(JSON.parse(resolveCall.init.body).sessionId, 'session-1');
  assert.equal(api.state().cwd, '/w');
  assert.equal(api.state().panelOpen, true);
});

test('a resolved workspace root is reused without another round trip', async () => {
  let resolveCalls = 0;
  const booted = boot({
    fetch: async (url) => {
      if (url === 'api/dsh-file-annotations/resolve') {
        resolveCalls += 1;
        return { ok: true, status: 200, json: async () => ({ ok: true, value: { cwd: '/w', source: 'live' } }) };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, value: { annotations: [] } }) };
    }
  });
  const { internals } = booted;
  assert.equal(await internals.resolveCwd('session-9'), '/w');
  assert.equal(internals.cachedCwd('session-9'), '/w', 'cached for the next click');
  assert.equal(await internals.resolveCwd('session-9'), '/w');
  assert.equal(resolveCalls, 1, 'one round trip per session');
});

/* ── boxed regions ────────────────────────────────────────────────────── */

test('dragging inside a page yields normalized coordinates', () => {
  const { internals } = boot();
  const target = { left: 100, top: 200, width: 400, height: 500 };
  const norm = internals.normalizeDrag(target, { x: 200, y: 300 }, { x: 300, y: 450 });
  assert.deepEqual(JSON.parse(JSON.stringify(norm)), { x: 0.25, y: 0.2, w: 0.25, h: 0.3 });
  assert.equal(internals.normalizeDrag(target, { x: 200, y: 300 }, { x: 201, y: 301 }), null, 'a click is not a box');
  assert.equal(internals.normalizeDrag({ left: 0, top: 0, width: 0, height: 0 }, { x: 0, y: 0 }, { x: 5, y: 5 }), null);
  const clamped = internals.normalizeDrag(target, { x: -100, y: -100 }, { x: 900, y: 900 });
  assert.deepEqual(JSON.parse(JSON.stringify(clamped)), { x: 0, y: 0, w: 1, h: 1 }, 'dragging outside clamps to the carrier');
});

test('region notes render their prompt with page and percentage box', () => {
  const { internals } = boot();
  const prompt = internals.buildPrompt([{
    id: '1', path: '/w/a.pdf', rel: 'a.pdf', comment: '这张表列的顺序反了', crop: '.dsh/annotations/crops/1.png',
    region: { kind: 'pdf', page: 2, x: 0.25, y: 0.2, w: 0.3, h: 0.1 }
  }]);
  assert.match(prompt, /【区域】第 2 页/);
  assert.match(prompt, /x=25%, y=20%, w=30%, h=10%/);
  assert.match(prompt, /裁剪图：\.dsh\/annotations\/crops\/1\.png/);
  const image = internals.buildPrompt([{ id: '2', path: '/w/a.png', rel: 'a.png', comment: 'c', region: { kind: 'image', x: 0, y: 0, w: 1, h: 1 } }]);
  assert.match(image, /【区域】图片/);
  const frame = internals.buildPrompt([{ id: '3', path: '/w/a.html', rel: 'a.html', comment: 'c', region: { kind: 'html', page: 1, x: 0, y: 0, w: 0.5, h: 0.5 } }]);
  assert.match(frame, /【区域】HTML 旧视口/);
});

test('an HTML region cannot be cropped (sandboxed frame) and still saves', () => {
  const { internals } = boot();
  assert.equal(internals.cropDataUrl({ kind: 'html', el: null }, { x: 0, y: 0, w: 1, h: 1 }), null);
  const record = internals.makeRecord({ path: '/w/a.html', comment: 'c', region: { kind: 'html', page: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.2 } });
  assert.ok(record.region);
  assert.equal(record.region.kind, 'html');
});

test('selecting only offers the Note action after the pointer is released', async () => {
  const { internals, document, window } = boot();
  internals.setViewRaw({ cwd: '/w', sessionId: 's', file: '/w/a.ts', rel: 'a.ts' });
  const outlet = document.createElement('div');
  outlet.setAttribute('data-slot', 'sidebar.right.pane.tab');
  const preview = document.createElement('pre');
  outlet.appendChild(preview);
  document.body.appendChild(outlet);
  window.getSelection = () => selectionIn(preview, 'const x = 1');

  // mid-drag: nothing appears
  document.emit('pointerdown', { button: 0, clientX: 10, clientY: 10, target: preview, preventDefault() {}, stopPropagation() {} });
  document.emit('selectionchange', {});
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(document.body.findByMark('inline'), null, 'a drag in progress never pops a composer');

  document.emit('pointerup', { button: 0, clientX: 60, clientY: 20, target: preview });
  await new Promise((resolve) => setTimeout(resolve, 220));
  assert.ok(document.body.findByMark('pop'), 'the Note action appears once the drag ends');
  assert.equal(document.body.findByMark('inline'), null, 'selecting does not open or focus an editor');
});

test('a box drag only starts on the carrier, never on the tab header', () => {
  const booted = boot();
  const { internals, document } = booted;
  const outlet = document.createElement('div');
  outlet.setAttribute('data-slot', 'sidebar.right.pane.tab');
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 800;
  canvas.getBoundingClientRect = () => ({ left: 100, top: 200, right: 500, bottom: 700, width: 400, height: 500 });
  outlet.appendChild(canvas);
  document.body.appendChild(outlet);
  internals.setViewRaw({ cwd: '/w', sessionId: 's', file: '/w/a.pdf', rel: 'a.pdf' });
  assert.equal(internals.previewKind(), 'pdf');

  assert.equal(internals.beginRegionDrag(450, 40), false, 'the header strip is not a box area');
  assert.equal(internals.beginRegionDrag(200, 300), true, 'a press on the page starts a box');
  assert.equal(internals.finishRegionDrag(300, 400), true);
  const inline = document.body.findByMark('inline');
  assert.ok(inline, 'releasing opens the composer');
  assert.ok(Number.isFinite(Number.parseFloat(inline.style.top)), 'the editor must have a finite screen position');
  assert.ok(Number.parseFloat(inline.style.top) < 800, 'the editor stays in the viewport');
  assert.equal(internals.getRegionMode(), false, 'one box ends the mode');
});

test('PDF box mode pauses for the editor, resumes after saving, and Escape exits', () => {
  const f = boot(); const { preview } = previewFixture(f, 'canvas', '/w/a.pdf');
  preview.width = 640; preview.height = 800;
  preview.getBoundingClientRect = () => ({ left: 0, top: 0, right: 320, bottom: 420, width: 320, height: 420 });
  assert.equal(f.internals.getRegionMode(), false, 'opening a PDF retains ordinary reading/selection');
  assert.equal(f.document.body.findByMark('capture'), null);
  f.internals.setRegionMode(true);
  for (let n = 1; n <= 2; n++) {
    assert.equal(f.document.body.findByMark('capture'), null, 'PDF uses its native page so wheel scrolling reaches the document');
    f.internals.beginRegionDrag(30, 60); f.internals.finishRegionDrag(150, 140);
    const input = f.document.body.findByMark('inlineInput');
    assert.equal(f.internals.getRegionMode(), true, 'the selected tool remains active while composing');
    assert.equal(f.document.body.findByMark('capture'), null, 'capture surfaces pause while the note is edited');
    assert.equal(f.internals.beginRegionDrag(20, 200), false, 'another drag cannot replace the draft');
    f.internals.syncCaptureLayers(); assert.equal(f.document.body.findByMark('capture'), null);
    input.value = 'PDF region ' + n; f.document.body.findByMark('inlineSave').click();
    assert.equal(f.internals.itemsOf('/w').length, n);
    assert.equal(f.document.body.findByMark('inline'), null);
    assert.equal(f.internals.getRegionMode(), true);
  }
  f.document.emit('keydown', { key: 'Escape' });
  assert.equal(f.internals.getRegionMode(), false);
  assert.equal(f.document.body.findByMark('capture'), null);
  f.internals.dispose();
});

test('Escape from a PDF draft exits continuous selection; tiny drags and Cancel keep the tool usable', () => {
  const f = boot(); const { preview } = previewFixture(f, 'canvas', '/w/a.pdf');
  preview.width = 640; preview.height = 800; f.internals.setRegionMode(true);
  f.internals.beginRegionDrag(20, 40); assert.equal(f.internals.finishRegionDrag(21, 41), false);
  assert.equal(f.document.body.findByMark('capture'), null);
  f.internals.beginRegionDrag(20, 40); f.internals.finishRegionDrag(180, 140);
  f.document.body.findByMark('ghost').click();
  assert.equal(f.internals.getRegionMode(), true); assert.equal(f.document.body.findByMark('capture'), null);
  f.internals.beginRegionDrag(20, 40); f.internals.finishRegionDrag(180, 140);
  f.document.emit('keydown', { key: 'Escape', target: f.document.body.findByMark('inlineInput') });
  assert.equal(f.internals.getRegionMode(), false);
  assert.equal(f.document.body.findByMark('inline'), null); assert.equal(f.document.body.findByMark('capture'), null);
  assert.equal(f.internals.itemsOf('/w').length, 0);
  f.internals.dispose();
});

test('switching away from a PDF draft never resumes its capture on another file', () => {
  const f = boot(); const { preview } = previewFixture(f, 'canvas', '/w/a.pdf');
  preview.width = 640; preview.height = 800; f.internals.setRegionMode(true);
  f.internals.beginRegionDrag(20, 40); f.internals.finishRegionDrag(180, 140);
  f.window.__dshFileAnnotations.setView({ file: '/w/other.txt' });
  assert.equal(f.internals.getRegionMode(), false); assert.equal(f.document.body.findByMark('capture'), null);
  f.internals.dispose();
});

test('toolbar-to-input/menu focus transfers keep the tool, while window blur exits it', () => {
  const f = boot(); previewFixture(f, 'canvas', '/w/a.pdf'); f.internals.setRegionMode(true);
  const anchor = f.document.createElement('button'); f.document.body.appendChild(anchor);
  f.window.emit('blur', {type:'blur',target:anchor}); assert.equal(f.internals.getRegionMode(), true);
  f.internals.toggleHtmlMenu(anchor);
  f.window.emit('blur', {type:'blur',target:anchor}); assert.ok(f.document.body.findByMark('toolMenu'));
  f.window.emit('blur', {type:'blur',target:f.window});
  assert.equal(f.internals.getRegionMode(), false); assert.equal(f.document.body.findByMark('toolMenu'), null);
  f.internals.dispose();
});

function nativePdfFixture(f = boot()) {
  const {outlet,preview} = previewFixture(f, 'div', '/w/a.pdf');
  preview.setAttribute('data-pdf-page','2');
  const canvas = f.document.createElement('canvas'); canvas.width=640; canvas.height=800; preview.appendChild(canvas);
  let top=0;
  canvas.getBoundingClientRect=()=>({left:0,top,right:320,bottom:top+420,width:320,height:420});
  return {...f,outlet,page:preview,canvas,setTop(value){top=value;}};
}

test('native PDF dragging leaves scrolling and controls intact and uses the scrolled page coordinates', () => {
  const f=nativePdfFixture(); f.internals.setRegionMode(true);
  assert.equal(f.document.body.findByMark('capture'),null);
  let prevented=0;
  const event={button:0,isPrimary:true,clientX:40,clientY:80,preventDefault(){prevented++;},stopPropagation(){}};
  const control=f.document.createElement('button'); f.outlet.appendChild(control);
  f.document.emit('pointerdown',{...event,target:control});
  f.document.emit('pointerup',{...event,target:control});
  assert.equal(prevented,0); assert.equal(f.document.body.findByMark('inline'),null);
  f.document.emit('pointerdown',{...event,target:f.outlet});
  assert.equal(prevented,0,'the scrollbar/scroller does not become a box gesture');
  f.setTop(-50); f.window.emit('scroll',{type:'scroll',target:f.outlet});
  assert.equal(f.internals.getRegionMode(),true);
  f.document.emit('pointerdown',{...event,target:f.canvas});
  f.document.emit('pointerup',{...event,target:f.canvas,clientX:160,clientY:180});
  const input=f.document.body.findByMark('inlineInput'); assert.ok(input); input.value='scrolled page box';
  f.document.body.findByMark('inlineSave').click();
  const [note]=f.internals.itemsOf('/w'); assert.equal(note.region.page,2);
  assert.equal(note.region.y,130/420); assert.equal(f.internals.getRegionMode(),true);
  assert.equal(f.document.body.findByMark('capture'),null);
  f.internals.dispose();
  assert.equal(f.outlet.getAttribute('data-dsh-annotation-pdf-box'),null);
});

test('scroll during a PDF drag cancels only that draft box and leaves the tool ready', () => {
  const f=nativePdfFixture(); f.internals.setRegionMode(true);
  f.internals.beginRegionDrag(20,40);
  f.window.emit('scroll',{type:'scroll',target:f.outlet});
  assert.equal(f.internals.getRegionMode(),true);
  assert.equal(f.document.body.findByMark('regionSel'),null);
  f.document.emit('pointerup',{button:0,clientX:100,clientY:100,target:f.canvas});
  assert.equal(f.document.body.findByMark('inline'),null);
  assert.equal(f.internals.beginRegionDrag(20,40),true);
  f.internals.finishRegionDrag(180,150); assert.ok(f.document.body.findByMark('inline'));
  f.internals.dispose();
});

test('PDF default-box preference persists, applies once per visit, and respects Escape and other file types', () => {
  const storage=makeLocalStorage(); const f=nativePdfFixture(boot({localStorage:storage}));
  assert.equal(f.internals.pdfAutoBox(),false); f.internals.maybeApplyPdfDefault(); assert.equal(f.internals.getRegionMode(),false);
  assert.equal(f.internals.setPdfAutoBox(true),true); assert.equal(f.internals.getRegionMode(),true); f.internals.dispose();
  const again=nativePdfFixture(boot({localStorage:storage}));
  again.internals.maybeApplyPdfDefault(); assert.equal(again.internals.getRegionMode(),true);
  again.document.emit('keydown',{key:'Escape'}); again.internals.maybeApplyPdfDefault();
  again.window.emit('scroll',{type:'scroll',target:again.outlet}); again.internals.maybeApplyPdfDefault();
  assert.equal(again.internals.getRegionMode(),false,'observer/scroll updates do not override a manual exit');
  again.window.__dshFileAnnotations.setView({file:'/w/b.pdf'}); again.internals.maybeApplyPdfDefault(); assert.equal(again.internals.getRegionMode(),true);
  again.internals.setPdfAutoBox(false); assert.equal(again.internals.getRegionMode(),false); again.internals.dispose();
  const manual=nativePdfFixture(boot({localStorage:storage})); manual.internals.maybeApplyPdfDefault();
  assert.equal(manual.internals.getRegionMode(),false); manual.internals.dispose();
  const image=boot({localStorage:storage}); previewFixture(image,'img','/w/picture.png'); image.internals.setPdfAutoBox(true);
  image.internals.maybeApplyPdfDefault(); assert.equal(image.internals.getRegionMode(),false); image.internals.dispose();
});

test('PDF icon and settings menu preserve accessible names and offer a persistent default checkbox', () => {
  const f=nativePdfFixture(); const tree=f.internals.PdfSelectionTools({file:'/w/a.pdf',sessionId:'s',activate(){}});
  assert.equal(tree.children[0].props['data-tool-icon'],'pdfBox');
  assert.equal(tree.children[0].children[0].type,'svg'); assert.equal(tree.children[0].props['aria-label'],'框选区域');
  assert.equal(tree.children[1].props['aria-label'],'PDF 批注设置');
  const anchor=f.document.createElement('button');f.outlet.appendChild(anchor);
  f.internals.toggleHtmlMenu(anchor,true);const item=f.document.body.findByMark('toolMenuItem');
  assert.equal(item.textContent,'打开 PDF 时默认框选');assert.equal(item.getAttribute('aria-checked'),'false');
  item.click();assert.equal(f.internals.pdfAutoBox(),true);assert.equal(f.internals.getRegionMode(),true);
  assert.equal(f.internals.itemsOf('/w').length,0,'changing a preference never saves/sends a note');
  f.internals.toggleHtmlMenu(anchor,true);assert.equal(f.document.body.findByMark('toolMenuItem').getAttribute('aria-checked'),'true');
  f.internals.dispose();
});

test('unavailable preference storage falls back to manual activation without dropping a draft', () => {
  const f=nativePdfFixture(boot({localStorage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}}));
  assert.equal(f.internals.pdfAutoBox(),false); assert.equal(f.internals.setPdfAutoBox(true),false);
  f.internals.maybeApplyPdfDefault();assert.equal(f.internals.getRegionMode(),false);f.internals.dispose();
});

function closePreviewFixture(f=boot()) {
  const panel=f.document.createElement('div'); panel.setAttribute('data-sidebar-right-panel','push');
  panel.setAttribute('data-sidebar-right-session','s');panel.setAttribute('data-sidebar-right-open','');f.document.body.appendChild(panel);
  function tab(id,path) {
    const body=f.document.createElement('div');body.setAttribute('data-sidebar-right-tab',id);body.setAttribute('data-slot','sidebar.right.pane.tab');panel.appendChild(body);
    const owner=f.document.createElement('button');owner.setAttribute(MARK,'action');owner.setAttribute('data-annotation-file',path);
    owner.setAttribute('data-annotation-owner','s');body.appendChild(owner);
    f.internals.setViewRaw({cwd:'/w',sessionId:'s',file:path,rel:path.slice(3),pane:body});f.internals.trackPreviewLifetime(owner);
    return {body,owner};
  }
  return {...f,panel,tab};
}

function guardedPreviewFixture(booted) {
  const f = closePreviewFixture(booted);
  const tabs = new Map();
  const listeners = new Set();
  const sidebarRight = {
    tabsIn: () => [...tabs.values()],
    closeIn(owner, id) {
      assert.equal(owner, 's');
      tabs.get(id).body.remove();
      tabs.delete(id);
      for (const listener of listeners) listener();
    },
    openTabs: {
      getSnapshot: () => [...tabs.keys()].map(tabId => ({ sessionId: 's', tabId })),
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    }
  };
  const nativeClose = sidebarRight.closeIn;
  f.internals.connectComposerRuntime({ sidebarRight, inputTriggers: { registerSource: () => () => {} } });
  return {
    ...f, tabs, sidebarRight, nativeClose,
    tab(id, path) { tabs.set(id, { ...f.tab(id, path), id }); },
    close(id) { sidebarRight.closeIn('s', id); },
    dialog() { return f.document.body.findByMark('closePreview'); }
  };
}

test('closing a preview asks once and leaves the preview and notes intact until confirmed', () => {
  const f = guardedPreviewFixture();
  f.tab('a', '/w/a.txt');
  f.tab('b', '/w/b.txt');
  f.internals.setItems('/w', [
    {id:'a',path:'/w/a.txt',sessionId:'s',comment:'a'},
    {id:'b',path:'/w/b.txt',sessionId:'s',comment:'b'},
    {id:'other',path:'/w/a.txt',sessionId:'other',comment:'other'}
  ]);
  f.close('a');
  const dialog = f.dialog();
  assert.equal(dialog.open, true);
  assert.match(dialog.children[1].textContent, /a\.txt.*1/);
  f.close('a');
  assert.equal(f.dialog(), dialog);
  assert.equal(f.tabs.has('a'), true);
  assert.equal(f.internals.itemsOf('/w').length, 3);
  dialog.findByMark('closePreviewCancel').click();
  assert.ok(!f.dialog());
  assert.equal(f.tabs.has('a'), true);
  assert.equal(f.internals.itemsOf('/w').length, 3);
  assert.equal(f.calls.fetch.length, 0);
  f.close('a');
  f.dialog().emit('cancel');
  assert.ok(!f.dialog());
  assert.equal(f.tabs.has('a'), true);
  f.close('a');
  f.dialog().findByMark('closePreviewConfirm').click();
  assert.ok(!f.dialog());
  assert.equal(f.tabs.has('a'), false);
  assert.deepEqual(Array.from(f.internals.itemsOf('/w'), note => note.id), ['b', 'other']);
  assert.ok(f.document.body.findByMark('undoNotice'));
  f.internals.dispose();
});

test('a preview closes directly when its notes are empty or another copy remains open', () => {
  const f = guardedPreviewFixture();
  f.tab('empty', '/w/empty.html');
  f.tab('first', '/w/file.pdf');
  f.tab('last', '/w/file.pdf');
  f.internals.setItems('/w', [{id:'same',path:'/w/file.pdf',sessionId:'s',comment:'same'}]);
  f.close('empty');
  f.close('first');
  assert.ok(!f.dialog());
  assert.deepEqual([...f.tabs.keys()], ['last']);
  assert.equal(f.internals.itemsOf('/w').length, 1);
  f.close('last');
  assert.ok(f.dialog());
  f.internals.dispose();
  assert.ok(!f.dialog());
  assert.equal(f.sidebarRight.closeIn, f.nativeClose);
  assert.equal(f.tabs.has('last'), true);
});

test('closing an image preview removes its hover tip and leaves other files free of its markers', () => {
  const f = guardedPreviewFixture();
  f.tab('other', '/w/other.png');
  f.tab('image', '/w/image.png');
  for (const tab of f.tabs.values()) tab.body.appendChild(f.document.createElement('img'));
  const region = {kind:'image',x:0.1,y:0.1,w:0.5,h:0.5};
  f.internals.setItems('/w', [
    {id:'current',path:'/w/image.png',sessionId:'s',comment:'9',region},
    {id:'keep',path:'/w/image.png',sessionId:'another',comment:'Other conversation',region}
  ]);
  f.internals.setScope('all');
  const badge = f.document.body.findByMark('mark');
  assert.ok(badge);
  badge.emit('mouseenter');
  assert.ok(f.document.body.findByMark('marktip'));

  f.close('image');
  f.dialog().findByMark('closePreviewConfirm').click();
  assert.equal(f.document.body.findByMark('marktip'), null);
  assert.equal(f.document.body.findByMark('mark'), null);
  assert.equal(f.document.body.findByMark('regionBox'), null);
  assert.deepEqual(Array.from(f.internals.itemsOf('/w'), note => note.id), ['keep']);
  f.internals.dispose();
});

test('a pending workspace read can supply notes and an old confirmation cannot close a replacement tab', async () => {
  let answer;
  const f = guardedPreviewFixture(boot({
    fetch: async () => new Promise(resolve => { answer = resolve; })
  }));
  f.tab('preview', '/w/old.pdf');
  const loaded = f.internals.loadStore('/w');
  f.close('preview');
  assert.ok(!f.dialog());
  assert.equal(f.tabs.has('preview'), true);
  answer({ok:true,json:async()=>({ok:true,value:{annotations:[
    {id:'late',path:'/w/old.pdf',sessionId:'s',comment:'late'}
  ]}})});
  await loaded;
  assert.ok(f.dialog());
  const old = f.tabs.get('preview');
  const replacement = { ...old, contentId: 'new resource' };
  f.tabs.set('preview', replacement);
  f.dialog().findByMark('closePreviewConfirm').click();
  assert.equal(f.tabs.get('preview'), replacement);
  assert.equal(f.internals.itemsOf('/w').length, 1);
  f.internals.dispose();
});

test('collapsing the sidebar preserves the composer chip and caches; closing the file clears them and offers Undo', async () => {
  const f=closePreviewFixture(await composerFixture());const preview=f.tab('one','/w/a.ts');
  stageNotes(f,[{id:'close-me',path:'/w/a.ts',sessionId:'s',comment:'keep on undo',crop:'.dsh/annotations/crops/close-me.png'}]);
  f.internals.cropPreviews.set('close-me','data:image/png;base64,large');
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(f.a.input.state.getSnapshot().occurrences.length,1);
  const stored=f.storage.getItem(f.internals.LS_PREFIX+'/w');
  f.panel.removeAttribute('data-sidebar-right-open');f.internals.syncPreviewLifetimes();
  assert.equal(f.internals.pendingFor('/w','s').length,1);
  assert.equal(f.internals.cropPreviews.has('close-me'),true);
  assert.equal(f.storage.getItem(f.internals.LS_PREFIX+'/w'),stored);
  assert.equal(f.a.input.state.getSnapshot().occurrences.length,1);
  assert.ok(!f.document.body.findByMark('undoNotice'));
  f.panel.setAttribute('data-sidebar-right-open','');f.internals.syncPreviewLifetimes();
  preview.body.remove();f.internals.syncPreviewLifetimes();
  assert.equal(f.internals.itemsOf('/w').length,0);assert.equal(f.internals.cropPreviews.has('close-me'),false);
  assert.equal(f.storage.getItem(f.internals.LS_PREFIX+'/w'),null);
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(f.a.input.state.getSnapshot().occurrences.length,0);
  const writes=f.calls.fetch.filter(call=>call.url.endsWith('/write'));
  assert.ok(writes.length);assert.equal(JSON.parse(writes.at(-1).init.body).annotations.length,0);
  assert.deepEqual(JSON.parse(writes.at(-1).init.body).removedCropIds,['close-me']);
  assert.ok(f.document.body.findByMark('undoNotice'));assert.equal(f.internals.undoClosedNotes(),true);
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(f.internals.pendingFor('/w','s').length,1);assert.equal(f.a.input.state.getSnapshot().occurrences.length,1);
  assert.equal(f.internals.cropPreviews.has('close-me'),false,'Undo reloads thumbnails on demand instead of retaining base64');
  f.internals.dispose();
});

test('tab switching and session unmount keep records; closing a file clears only its own destination/file', async () => {
  const f=closePreviewFixture();const a=f.tab('a','/w/a.ts');const b=f.tab('b','/w/b.ts');
  f.internals.setItems('/w',[{id:'a',path:'/w/a.ts',sessionId:'s',comment:'a'},{id:'b',path:'/w/b.ts',sessionId:'s',comment:'b'},
    {id:'other',path:'/w/a.ts',sessionId:'other',comment:'other session'}]);
  a.body.style.display='none';f.internals.syncPreviewLifetimes();assert.equal(f.internals.itemsOf('/w').length,3);
  f.panel.remove();f.internals.syncPreviewLifetimes();assert.equal(f.internals.itemsOf('/w').length,3,'unmounting a conversation is not a close gesture');
  f.document.body.appendChild(f.panel);a.body.remove();f.internals.syncPreviewLifetimes();
  assert.deepEqual(Array.from(f.internals.itemsOf('/w'),item=>item.id),['b','other']);
  f.internals.dispose();
});

test('duplicate file previews keep notes until the last occurrence closes', () => {
  const f=closePreviewFixture();const a=f.tab('a','/w/a.ts');const b=f.tab('b','/w/a.ts');
  f.internals.setItems('/w',[{id:'same',path:'/w/a.ts',sessionId:'s',comment:'same'}]);
  a.body.remove();f.internals.syncPreviewLifetimes();assert.equal(f.internals.itemsOf('/w').length,1);
  b.body.remove();f.internals.syncPreviewLifetimes();assert.equal(f.internals.itemsOf('/w').length,0);
  f.internals.dispose();
});

test('duplicate close notifications keep the original Undo snapshot alive', () => {
  const f=boot();f.internals.setItems('/w',[{id:'once',path:'/w/a.ts',sessionId:'s',comment:'once'}]);
  const targets=[{cwd:'/w',path:'/w/a.ts',sessionId:'s'}];
  assert.equal(f.internals.clearPreviewNotes(targets),1);assert.equal(f.internals.clearPreviewNotes(targets),0);
  assert.ok(f.document.body.findByMark('undoNotice'));assert.equal(f.internals.undoClosedNotes(),true);
  assert.equal(f.internals.itemsOf('/w').length,1);f.internals.dispose();
});

test('collapsing an unmounted preview preserves tracked and unvisited notes while its host tab remains open', () => {
  const f=guardedPreviewFixture();f.tab('active','/w/a.ts');
  f.internals.setItems('/w',[{id:'active',path:'/w/a.ts',sessionId:'s',comment:'a'},
    {id:'unvisited',path:'/w/old.pdf',sessionId:'s',comment:'b'},{id:'other',path:'/w/x.ts',sessionId:'another',comment:'c'}]);
  f.panel.removeAttribute('data-sidebar-right-open');
  const body=f.tabs.get('active').body;
  body.remove();f.internals.syncPreviewLifetimes();
  assert.deepEqual(Array.from(f.internals.itemsOf('/w'),note=>note.id),['active','unvisited','other']);
  f.panel.appendChild(body);f.panel.setAttribute('data-sidebar-right-open','');f.internals.syncPreviewLifetimes();
  f.close('active');
  assert.ok(f.dialog());
  f.dialog().findByMark('closePreviewConfirm').click();
  assert.deepEqual(Array.from(f.internals.itemsOf('/w'),note=>note.id),['unvisited','other']);
  f.internals.dispose();
});

test('a late workspace read cannot resurrect closed notes or discard unrelated files; Undo restores them', async () => {
  let answer;
  const f=boot({fetch:async url=>String(url).endsWith('/read')?new Promise(resolve=>{answer=resolve;}):({ok:true,json:async()=>({ok:true,value:{}})})});
  const loading=f.internals.loadStore('/w');
  f.internals.clearPreviewNotes([{cwd:'/w',sessionId:'s',path:'/w/a.ts'}]);
  answer({ok:true,json:async()=>({ok:true,value:{annotations:[{id:'late',path:'/w/a.ts',sessionId:'s',comment:'late'},
    {id:'keep',path:'/w/b.ts',sessionId:'s',comment:'keep'}]}})});
  await loading;await new Promise(resolve=>setTimeout(resolve,5));
  assert.deepEqual(Array.from(f.internals.itemsOf('/w'),note=>note.id),['keep']);
  const writes=f.calls.fetch.filter(call=>call.url.endsWith('/write'));
  assert.deepEqual(JSON.parse(writes.at(-1).init.body).annotations.map(note=>note.id),['keep']);
  assert.equal(f.internals.undoClosedNotes(),true);
  assert.deepEqual(Array.from(f.internals.itemsOf('/w'),note=>note.id).sort(),['keep','late']);
  f.internals.dispose();
});

test('queued writes finish in order and the final JSON payload cannot restore a removed note', async () => {
  let release;let writes=0;
  const f=boot({fetch:async url=>{
    if(String(url).endsWith('/write')&&++writes===1)return new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({ok:true,value:{}})});});
    return {ok:true,json:async()=>({ok:true,value:{annotations:[]}})};
  }});
  f.internals.setItems('/w',[{id:'order',path:'/w/a.ts',sessionId:'s',comment:'order'}]);
  const saving=f.internals.saveStore('/w');await new Promise(resolve=>setTimeout(resolve,0));
  f.internals.clearPreviewNotes([{cwd:'/w',sessionId:'s',path:'/w/a.ts'}]);release();await saving;
  await new Promise(resolve=>setTimeout(resolve,5));
  const calls=f.calls.fetch.filter(call=>call.url.endsWith('/write'));
  assert.equal(JSON.parse(calls[0].init.body).annotations.length,1);
  assert.equal(JSON.parse(calls.at(-1).init.body).annotations.length,0);
  f.internals.dispose();
});

test('closing a sending batch defers deletion until admission and sends durable image protection', async () => {
  let admit;
  const f=await composerFixture({prompt:()=>new Promise(resolve=>{admit=resolve;})});
  stageNotes(f,[{id:'flight-close',path:'/w/a.pdf',sessionId:'s',comment:'sending',crop:'.dsh/annotations/crops/flight-close.png'}]);
  const text=await f.source.current.codec.serialize(f.a.entry.ref);
  const sending=f.a.session.prompt([{type:'text',text}],'queue');
  f.internals.clearPreviewNotes([{cwd:'/w',sessionId:'s',path:'/w/a.pdf'}]);
  assert.equal(f.internals.itemsOf('/w').length,1,'the admitted batch retains its metadata and images while in flight');
  admit({ok:true});await sending;await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(f.internals.itemsOf('/w').length,0);
  assert.ok(f.calls.fetch.filter(call=>call.url.endsWith('/write')).some(call=>JSON.parse(call.init.body).protectedCropIds.includes('flight-close')));
  f.internals.dispose();
});

test('a thumbnail response after close never repopulates the preview cache', async () => {
  const effects=[];let answer;
  const f=boot({react:{...reactStub,useEffect(fn){effects.push(fn);}},fetch:async url=>{
    if(String(url).endsWith('/crop-preview'))return new Promise(resolve=>{answer=resolve;});
    return {ok:true,json:async()=>({ok:true,value:{annotations:[]}})};
  }});
  const note={id:'thumb',path:'/w/a.pdf',sessionId:'s',comment:'c',crop:'.dsh/annotations/crops/thumb.png'};
  f.internals.setItems('/w',[note]);f.internals.PendingNoteCard({cwd:'/w',item:note});
  const cleanups=effects.map(fn=>fn()).filter(fn=>typeof fn==='function');
  f.internals.clearPreviewNotes([{cwd:'/w',sessionId:'s',path:'/w/a.pdf'}]);cleanups.forEach(fn=>fn());
  answer({ok:true,json:async()=>({ok:true,value:{dataUrl:'data:image/png;base64,AAAA'}})});
  await new Promise(resolve=>setTimeout(resolve,5));assert.equal(f.internals.cropPreviews.has('thumb'),false);f.internals.dispose();
});

/* ── panel ─────────────────────────────────────────────────────────────── */

test('panel opens as a dialog, shows the batch and closes cleanly', () => {
  const { internals, document, window } = boot();
  internals.setViewRaw({ cwd: '/w', sessionId: 's', file: '/w/a.ts', rel: 'a.ts' });
  internals.setItems('/w', [{ id: '1', path: '/w/a.ts', rel: 'a.ts', quote: 'q', comment: 'c', createdAt: 1 }]);
  assert.equal(internals.openPanel({ cwd: '/w', file: '/w/a.ts', rel: 'a.ts' }), true);
  assert.equal(internals.isPanelOpen(), true);
  const panel = document.body.findByMark('panel');
  assert.ok(panel, 'the panel node exists');
  assert.equal(panel.getAttribute('role'), 'dialog');
  assert.equal(window.__dshFileAnnotations.state().annotations, 1);
  assert.equal(internals.closePanel(), true);
  assert.equal(internals.isPanelOpen(), false);
});

test('composing saves a note with the selected quote', async () => {
  const { internals, document, window } = boot();
  internals.openPanel({ cwd: '/w', sessionId: 's', file: '/w/a.ts', rel: 'a.ts', quote: 'const x = 1' });
  const textarea = document.body.findByMark('textarea');
  assert.ok(textarea, 'compose textarea exists');
  textarea.value = '这里要加校验';
  const saved = document.body.findByMark('primary');
  saved.click();
  const list = window.__dshFileAnnotations.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].quote, 'const x = 1');
  assert.equal(list[0].comment, '这里要加校验');
  assert.equal(list[0].rel, 'a.ts');
  assert.equal(textarea.value, '', 'the composer clears after saving');
});

test('composing without a file is refused instead of guessing', () => {
  const { internals, document, window } = boot();
  internals.setViewRaw({ cwd: '/w', sessionId: 's', file: null, rel: null });
  internals.openPanel({ cwd: '/w' });
  const textarea = document.body.findByMark('textarea');
  textarea.value = '孤儿批注';
  document.body.findByMark('primary').click();
  assert.equal(window.__dshFileAnnotations.list().length, 0, 'a note needs a file to live on');
});

test('delete removes one note from the batch', () => {
  const { internals, document, window } = boot();
  internals.setViewRaw({ cwd: '/w', sessionId: 's', file: '/w/a.ts', rel: 'a.ts' });
  internals.openPanel({ cwd: '/w', file: '/w/a.ts', rel: 'a.ts' });
  const a = internals.addAnnotation('/w', { path: '/w/a.ts', rel: 'a.ts', comment: 'c1' });
  const b = internals.addAnnotation('/w', { path: '/w/a.ts', rel: 'a.ts', comment: 'c2' });
  a.sentAt = 1; b.sentAt = 2;
  internals.openPanel({ cwd: '/w', file: '/w/a.ts', rel: 'a.ts' });
  const deletes = [];
  (function walk(node) {
    if (node.getAttribute(MARK) === 'del') deletes.push(node);
    node.children.forEach(walk);
  })(document.body);
  assert.equal(deletes.length, 2);
  deletes[0].click();
  assert.equal(window.__dshFileAnnotations.list().length, 1);
});

/* ── store ─────────────────────────────────────────────────────────────── */

test('the host store receives the full batch and localStorage mirrors it', async () => {
  const { internals, storage, calls, window } = boot();
  internals.setViewRaw({ cwd: '/w', sessionId: 's', file: null, rel: null });
  internals.setItems('/w', [{ id: '1', path: '/w/a.ts', comment: 'c' }]);
  assert.equal(await window.__dshFileAnnotations.flush(), true);
  const write = calls.fetch.find((call) => call.url === 'api/dsh-file-annotations/write');
  assert.ok(write, 'the write route is called');
  assert.equal(JSON.parse(write.init.body).cwd, '/w');
  assert.ok(storage.getItem('dsh.file-annotations.v1:/w'), 'localStorage mirror exists');
});

test('a failed load is retried instead of pinning the workspace', async () => {
  let attempts = 0;
  const { internals } = boot({
    fetch: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('network-down');
      return { ok: true, status: 200, json: async () => ({ ok: true, value: { annotations: [] } }) };
    }
  });
  internals.setViewRaw({ cwd: '/w', sessionId: 's', file: null, rel: null });
  await internals.openPanel({ cwd: '/w' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(internals.getLoadState('/w'), 'offline');
  internals.openPanel({ cwd: '/w' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(attempts, 2, 'a later open retries the read');
});

test('a failing host store degrades to localStorage without losing notes', async () => {
  const { internals, storage, window } = boot({
    fetch: async () => ({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, error: { code: 'store-write-failed' } })
    })
  });
  internals.setViewRaw({ cwd: '/w', sessionId: 's', file: null, rel: null });
  internals.setItems('/w', [{ id: '1', path: '/w/a.ts', comment: 'c' }]);
  await window.__dshFileAnnotations.flush();
  const stored = JSON.parse(storage.getItem('dsh.file-annotations.v1:/w'));
  assert.equal(stored.annotations.length, 1);
});

test('loadStore keeps the localStorage cache when the host route fails', async () => {
  const storage = makeLocalStorage();
  storage.setItem('dsh.file-annotations.v1:/w', JSON.stringify({
    version: 1,
    annotations: [{ id: 'a1', path: '/w/a.ts', comment: 'cached' }]
  }));
  const { internals } = boot({
    localStorage: storage,
    fetch: async () => ({ ok: false, status: 404, json: async () => ({ ok: false, error: { code: 'not-found' } }) })
  });
  internals.setViewRaw({ cwd: '/w', sessionId: 's', file: null, rel: null });
  internals.openPanel({ cwd: '/w' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(internals.itemsOf('/w').length, 1);
});

/* ── selection layer ───────────────────────────────────────────────────── */

/** Build a selection stub whose common ancestor is the given element. */
function selectionIn(element, text) {
  return {
    rangeCount: 1,
    toString: () => text,
    getRangeAt: () => ({
      collapsed: false,
      commonAncestorContainer: element,
      getBoundingClientRect: () => ({ left: 10, top: 10, right: 90, bottom: 20, width: 80, height: 10 })
    })
  };
}

test('selections outside the sidebar preview never raise the note button', () => {
  const { internals, document, window } = boot();
  window.getSelection = () => selectionIn(document.body, 'outside text');
  internals.evaluateSelection();
  assert.equal(document.body.findByMark('pop'), null);
});

test('selecting text only offers Note; clicking it opens the inline composer', () => {
  const { internals, document, window } = boot();
  internals.setViewRaw({ cwd: '/w', sessionId: 's', file: '/w/a.ts', rel: 'a.ts' });
  const outlet = document.createElement('div');
  outlet.setAttribute('data-slot', 'sidebar.right.pane.tab');
  const preview = document.createElement('pre');
  outlet.appendChild(preview);
  document.body.appendChild(outlet);
  window.getSelection = () => selectionIn(preview, 'const x = 1');
  internals.evaluateSelection();
  assert.equal(document.body.findByMark('inline'), null, 'selection alone never opens an editor');
  assert.equal(internals.itemsOf('/w').length, 0, 'selection alone never creates a note');
  document.body.findByMark('pop').click();
  assert.ok(document.body.findByMark('inline'), 'the composer appears where the text was selected');
  assert.equal(document.body.findByMark('panel'), null, 'the management panel stays closed');
  assert.equal(window.__dshFileAnnotations.state().panelOpen, false);
});

test('the inline composer saves a Session-scoped note without inventing an anchor', () => {
  const { internals, document, window } = boot();
  internals.setViewRaw({ cwd: '/w', sessionId: 's', file: '/w/a.ts', rel: 'a.ts' });
  const outlet = document.createElement('div');
  outlet.setAttribute('data-slot', 'sidebar.right.pane.tab');
  const preview = document.createElement('pre');
  outlet.appendChild(preview);
  document.body.appendChild(outlet);
  window.getSelection = () => selectionIn(preview, 'const x = 1');
  internals.evaluateSelection();
  document.body.findByMark('pop').click();
  const input = document.body.findByMark('inlineInput');
  assert.ok(input, 'the composer has an input');
  input.value = '这里要校验';
  const save = document.body.findByMark('inlineSave');
  save.click();
  const list = window.__dshFileAnnotations.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].sessionId, 's', 'the note remembers which Session wrote it');
  assert.equal(list[0].quote, 'const x = 1');
  assert.equal(document.body.findByMark('inline'), null, 'the composer closes after saving');
  assert.equal(document.body.findByMark('mark'), null, 'an unmeasurable quote must not become a misleading rail marker');
});

function previewFixture(booted, tag = 'pre', path = '/w/a.ts') {
  const { document, internals } = booted;
  const outlet = document.createElement('div');
  outlet.setAttribute('data-slot', 'sidebar.right.pane.tab');
  const preview = document.createElement(tag);
  outlet.appendChild(preview);
  document.body.appendChild(outlet);
  internals.setViewRaw({ cwd: '/w', sessionId: 's', file: path, rel: path.slice(3) });
  return { outlet, preview };
}

test('one-character and keyboard selections offer Note; Escape dismisses it', async () => {
  const booted = boot();
  const { preview } = previewFixture(booted);
  booted.window.getSelection = () => selectionIn(preview, 'π');
  booted.document.emit('selectionchange', {});
  await new Promise((resolve) => setTimeout(resolve, 180));
  assert.ok(booted.document.body.findByMark('pop'));
  assert.equal(booted.document.body.findByMark('inline'), null);
  booted.document.emit('keydown', { key: 'Escape' });
  assert.equal(booted.document.body.findByMark('pop'), null);
  booted.internals.dispose();
});

function selectionToolbarFixture(label = '添加到对话') {
  const f = boot();
  const { preview } = previewFixture(f);
  preview.setAttribute('data-annotation-preview', 'better-sidebar');
  f.window.getComputedStyle = node => ({ position: node.tagName === 'BUTTON' ? 'fixed' : 'static' });
  f.window.getSelection = () => selectionIn(preview, 'selected source');
  const native = f.document.createElement('button'); native.type = 'button'; native.textContent = label;
  native.getBoundingClientRect = () => ({ left: 200, top: 100, width: 110, height: 28, right: 310, bottom: 128 });
  f.document.body.appendChild(native);
  return { ...f, native, preview };
}

test('a shared selection toolbar retains the native portal and its original insertion callback', () => {
  const f = selectionToolbarFixture(); let inserted = '';
  f.native.addEventListener('click', () => { inserted = '```a.ts:2-3\nselected source\n```'; });
  f.internals.evaluateSelection();
  assert.ok(f.document.body.findByMark('selectionTools'));
  assert.equal(f.native.parentNode, f.document.body, 'the React-owned portal must never be reparented');
  assert.equal(f.native.getAttribute('data-dsh-file-annotations-peer'), 'selection');
  assert.equal(f.document.body.querySelectorAll('[data-dsh-file-annotations="pop"]').length, 1);
  f.document.emit('pointerdown', { button: 0, target: f.native });
  assert.ok(f.document.body.findByMark('selectionTools'), 'pressing the native half keeps its click target in place');
  f.native.click();
  assert.equal(inserted, '```a.ts:2-3\nselected source\n```');
  assert.equal(f.internals.itemsOf('/w').length, 0);
  assert.equal(f.document.body.findByMark('selectionTools'), null);
  assert.equal(f.native.getAttribute('data-dsh-file-annotations-peer'), null);
  assert.equal(f.native.style['--dsh-note-peer-left'], undefined);
  f.internals.dispose();
});

test('Note survives the native outside-mousedown dismissal until its own click opens the editor', () => {
  const f = selectionToolbarFixture('Add to conversation');
  f.internals.evaluateSelection();
  const note = f.document.body.findByMark('pop');
  let preserved = false;
  note.emit('pointerdown', { preventDefault() { preserved = true; } });
  f.native.remove(); f.internals.syncSelectionToolbar();
  assert.equal(preserved, true);
  assert.equal(f.document.body.findByMark('pop'), note);
  note.click();
  assert.equal(f.document.body.findByMark('inlineQuote').textContent, 'selected source');
  assert.equal(f.document.body.findByMark('selectionTools'), null);
  assert.equal(f.internals.itemsOf('/w').length, 0, 'opening an editor does not save or send');
  f.internals.dispose();
});

test('late native portals merge, and disappearing portals or disposal release all decoration', () => {
  const f = selectionToolbarFixture(); f.native.remove();
  f.internals.evaluateSelection();
  assert.equal(f.document.body.findByMark('selectionTools'), null);
  f.document.body.appendChild(f.native); f.internals.syncSelectionToolbar();
  assert.ok(f.document.body.findByMark('selectionTools'));
  f.native.remove(); f.internals.syncSelectionToolbar();
  assert.equal(f.document.body.findByMark('pop'), null);
  f.document.body.appendChild(f.native); f.internals.evaluateSelection(); f.internals.dispose();
  assert.equal(f.native.parentNode, f.document.body);
  assert.equal(f.native.getAttribute('data-dsh-file-annotations-peer'), null);
  assert.equal(f.document.body.findByMark('selectionTools'), null);
});

test('unrelated controls and non-Better previews never become a toolbar peer', () => {
  const f = selectionToolbarFixture('Another action');
  f.internals.evaluateSelection(); assert.equal(f.native.getAttribute('data-dsh-file-annotations-peer'), null);
  f.native.textContent = '添加到对话'; f.preview.removeAttribute('data-annotation-preview');
  f.internals.evaluateSelection(); assert.equal(f.native.getAttribute('data-dsh-file-annotations-peer'), null);
  assert.ok(f.document.body.findByMark('pop'));
  f.internals.dispose();
});

test('another selection cannot replace an open draft or change its quote', () => {
  const booted = boot();
  const { preview } = previewFixture(booted);
  booted.window.getSelection = () => selectionIn(preview, 'original quote');
  booted.internals.evaluateSelection();
  booted.document.body.findByMark('pop').click();
  const input = booted.document.body.findByMark('inlineInput');
  input.value = 'keep my unfinished note';
  booted.window.getSelection = () => selectionIn(preview, 'another quote');
  booted.internals.evaluateSelection();
  assert.equal(booted.document.body.findByMark('inlineInput'), input);
  assert.equal(input.value, 'keep my unfinished note');
  assert.equal(booted.document.body.findByMark('inlineQuote').textContent, 'original quote');
  booted.internals.dispose();
});

test('typing in a preview form never offers a file annotation', () => {
  const booted = boot();
  const { preview } = previewFixture(booted, 'textarea');
  booted.window.getSelection = () => selectionIn(preview, 'form value');
  assert.equal(booted.internals.evaluateSelection(), false);
  assert.equal(booted.document.body.findByMark('pop'), null);
});

test('changing file or Session removes stale actions, drafts and capture layers', () => {
  const booted = boot();
  const { preview } = previewFixture(booted);
  booted.window.getSelection = () => selectionIn(preview, 'old quote');
  booted.internals.evaluateSelection();
  const stale = booted.document.body.findByMark('pop');
  booted.window.__dshFileAnnotations.setView({ file: '/w/b.ts' });
  assert.equal(booted.document.body.findByMark('pop'), null);
  stale.click();
  assert.equal(booted.document.body.findByMark('inline'), null);
  booted.internals.evaluateSelection();
  booted.document.body.findByMark('pop').click();
  booted.window.__dshFileAnnotations.setView({ sessionId: 'other', cwd: '/other', file: '/other/a.ts' });
  assert.equal(booted.document.body.findByMark('inline'), null);
  assert.equal(booted.window.__dshFileAnnotations.list().length, 0);
  booted.internals.dispose();
});

test('HTML capture only covers the frame; pointer drag opens a visible editor and saves a region', () => {
  const booted = boot();
  const { preview } = previewFixture(booted, 'iframe', '/w/a.html');
  preview.getBoundingClientRect = () => ({ left: 50, top: 100, right: 300, bottom: 400, width: 250, height: 300 });
  booted.internals.setRegionMode(true);
  const capture = booted.document.body.findByMark('capture');
  assert.ok(capture, 'opaque frame needs a parent-owned drag target');
  assert.equal(capture.style.top, '100px', 'the header above the frame stays outside capture');
  assert.equal(capture.style.height, '300px');
  const event = { button: 0, pointerId: 1, target: capture, preventDefault() {}, stopPropagation() {} };
  booted.document.emit('pointerdown', { ...event, clientX: 100, clientY: 150 });
  booted.document.emit('pointermove', { ...event, clientX: 220, clientY: 250 });
  booted.document.emit('pointerup', { ...event, clientX: 220, clientY: 250 });
  const editor = booted.document.body.findByMark('inline');
  assert.ok(editor);
  assert.ok(Number.parseFloat(editor.style.top) >= 8);
  assert.ok(Number.parseFloat(editor.style.top) <= 680);
  assert.equal(booted.document.body.findByMark('capture'), null, 'capture is removed before typing');
  booted.document.body.findByMark('inlineInput').value = 'adjust this region';
  booted.document.body.findByMark('inlineSave').click();
  const [note] = booted.window.__dshFileAnnotations.list();
  assert.equal(note.region.kind, 'html');
  assert.equal(note.sessionId, 's');
  assert.equal(note.region.x, 0.2);
  booted.internals.dispose();
});

test('cancelling or disposing box mode removes all pointer interception', () => {
  const booted = boot();
  previewFixture(booted, 'iframe', '/w/a.html');
  booted.internals.setRegionMode(true);
  assert.ok(booted.document.body.findByMark('capture'));
  booted.document.emit('pointercancel', {});
  assert.equal(booted.internals.getRegionMode(), false);
  assert.equal(booted.document.body.findByMark('capture'), null);
  booted.internals.setRegionMode(true);
  booted.internals.dispose();
  assert.equal(booted.document.body.findByMark('capture'), null);
  assert.equal(booted.document.body.findByMark('captureHint'), null);
  assert.equal(booted.document.listenerCount(), 0);
});

test('lazily mounted PDF pages use actual page identity and never a neighbour canvas', () => {
  const booted = boot();
  const { outlet, preview } = previewFixture(booted, 'canvas', '/w/a.pdf');
  const page = booted.document.createElement('div');
  page.setAttribute('data-pdf-page', '4');
  outlet.removeChild(preview);
  page.appendChild(preview);
  outlet.appendChild(page);
  assert.equal(booted.internals.carriers()[0].page, 4);
  assert.equal(booted.internals.carrierForRegion({ kind: 'pdf', page: 4 }), preview);
  assert.equal(booted.internals.carrierForRegion({ kind: 'pdf', page: 1 }), null);
});

test('workspace prefix lookalikes are not accepted as the current file root', () => {
  const { internals } = boot();
  internals.setViewRaw({ cwd: '/work/project', sessionId: 's', file: null });
  assert.equal(internals.cwdForFile('/work/project-other/a.ts'), null);
  assert.equal(internals.cwdForFile('/work/project/a.ts'), '/work/project');
});

test('a slow save keeps its original Session and file after switching views', async () => {
  let resolveWorkspace;
  let resolves = 0;
  const booted = boot({ fetch: async (url) => {
    if (String(url).endsWith('/resolve')) {
      resolves += 1;
      return new Promise((resolve) => { resolveWorkspace = () => resolve({ ok: true, json: async () => ({ ok: true, value: { cwd: '/w' } }) }); });
    }
    return { ok: true, json: async () => ({ ok: true, value: {} }) };
  } });
  const { preview } = previewFixture(booted);
  booted.internals.setViewRaw({ cwd: null, sessionId: 's', file: '/w/a.ts', rel: 'a.ts' });
  booted.window.getSelection = () => selectionIn(preview, 'original quote');
  booted.internals.evaluateSelection();
  booted.document.body.findByMark('pop').click();
  booted.document.body.findByMark('inlineInput').value = 'save to the original Session';
  const save = booted.document.body.findByMark('inlineSave');
  save.click(); save.click();
  assert.equal(resolves, 1, 'double-clicking Save must not create duplicate pending writes');
  booted.window.__dshFileAnnotations.setView({ sessionId: 'other', cwd: '/other', file: '/other/b.ts' });
  resolveWorkspace();
  await new Promise((resolve) => setTimeout(resolve, 10));
  const [note] = booted.internals.itemsOf('/w');
  assert.equal(note.sessionId, 's');
  assert.equal(note.path, '/w/a.ts');
  assert.equal(booted.internals.itemsOf('/w').length, 1);
  assert.equal(booted.internals.getView().cwd, '/other', 'late resolution cannot change the active workspace');
  booted.internals.dispose();
});

test('spreadsheet and scratch canvases are not treated as PDF pages', () => {
  const booted = boot();
  previewFixture(booted, 'canvas', '/w/table.xlsx');
  assert.equal(booted.internals.previewKind(), 'text');
  assert.equal(booted.internals.carriers().length, 0);
});

test('offscreen region markers never float over the document header', () => {
  const booted = boot();
  const { preview } = previewFixture(booted, 'canvas', '/w/a.pdf');
  preview.getBoundingClientRect = () => ({ left: 0, top: -600, right: 320, bottom: -100, width: 320, height: 500 });
  booted.internals.setItems('/w', [{ id: 'offscreen', path: '/w/a.pdf', sessionId: 's', comment: 'c', region: { kind: 'pdf', page: 1, x: 0, y: 0, w: 0.5, h: 0.5 } }]);
  booted.internals.openPanel({ cwd: '/w', sessionId: 's', file: '/w/a.pdf' });
  assert.equal(booted.document.body.findByMark('regionBox'), null);
  assert.equal(booted.document.body.findByMark('mark'), null);
  booted.internals.dispose();
});

test('two Sessions in one workspace no longer share a view', () => {
  const { internals, window } = boot();
  internals.setViewRaw({ cwd: '/w', sessionId: 'session-a', file: '/w/a.ts', rel: 'a.ts' });
  internals.setItems('/w', [
    { id: '1', path: '/w/a.ts', comment: 'A 的批注', sessionId: 'session-a' },
    { id: '2', path: '/w/a.ts', comment: 'B 的批注', sessionId: 'session-b' },
    { id: '3', path: '/w/a.ts', comment: '老数据（没有会话）' }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(internals.visibleOf('/w').map((item) => item.comment))), ['A 的批注']);
  internals.setScope('all');
  assert.equal(internals.visibleOf('/w').length, 3, 'the toggle reveals every Session plus legacy rows');
  internals.setScope('session');
  assert.equal(internals.visibleOf('/w').length, 1);
  assert.ok(window.__dshFileAnnotations.list().every((item) => item.sessionId === 'session-a'));
});

test('only whole-file notes use the rail when quote geometry is unavailable', () => {
  const booted = boot();
  const { internals, document } = booted;
  internals.setViewRaw({ cwd: '/w', sessionId: 's', file: '/w/a.ts', rel: 'a.ts' });
  internals.setItems('/w', [
    { id: '1', path: '/w/a.ts', quote: 'not rendered anywhere', comment: 'c1', sessionId: 's' },
    { id: '2', path: '/w/a.ts', comment: 'c2', sessionId: 's' }
  ]);
  const outlet = document.createElement('div');
  outlet.setAttribute('data-slot', 'sidebar.right.pane.tab');
  document.body.appendChild(outlet);
  internals.openPanel({ cwd: '/w', file: '/w/a.ts', rel: 'a.ts' });
  internals.dispose();
  const booted2 = boot();
  booted2.internals.setViewRaw({ cwd: '/w', sessionId: 's', file: '/w/a.ts', rel: 'a.ts' });
  booted2.internals.setItems('/w', [
    { id: '1', path: '/w/a.ts', quote: 'not rendered anywhere', comment: 'c1', sessionId: 's' },
    { id: '2', path: '/w/a.ts', comment: 'c2', sessionId: 's' }
  ]);
  const outlet2 = booted2.document.createElement('div');
  outlet2.setAttribute('data-slot', 'sidebar.right.pane.tab');
  booted2.document.body.appendChild(outlet2);
  booted2.internals.install();
  booted2.internals.openPanel({ cwd: '/w', file: '/w/a.ts', rel: 'a.ts' });
  const marks = [];
  (function walk(node) {
    if (node.getAttribute(MARK) === 'mark') marks.push(node);
    node.children.forEach(walk);
  })(booted2.document.body);
  assert.equal(marks.length, 1, 'quoted text does not appear at an unrelated rail location');
});

/* ── disposal ──────────────────────────────────────────────────────────── */

test('dispose removes listeners, styles, floating nodes and the debug global', () => {
  const booted = boot();
  mount(booted);
  booted.internals.openPanel({ cwd: '/w' });
  assert.ok(booted.document.listenerCount() > 0, 'listeners were attached');
  booted.internals.dispose();
  assert.equal(booted.document.listenerCount(), 0);
  assert.equal(booted.document.head.children.filter((node) => node.tagName === 'STYLE').length, 0);
  assert.equal(booted.document.body.findByMark('panel'), null);
  assert.equal(booted.window.__dshFileAnnotations, undefined);
});

test('dispose is idempotent', () => {
  const booted = boot();
  mount(booted);
  booted.internals.dispose();
  assert.doesNotThrow(() => booted.internals.dispose());
});

test('installing twice keeps one stylesheet and one set of listeners', () => {
  const booted = boot();
  booted.internals.install();
  const before = booted.document.listenerCount();
  booted.internals.install();
  assert.equal(booted.document.listenerCount(), before);
  assert.equal(booted.document.head.children.filter((node) => node.tagName === 'STYLE').length, 1);
});

/* ── native composer submission ───────────────────────────────────────── */
async function composerFixture(options = {}) {
  const booted = boot();
  const bindings = new Map();
  const inputs = new Map();
  const source = { current: null };
  const runtime = {
    sessions: { binding: (id) => bindings.get(id) },
    conversation: { input: { for: (ctx) => inputs.get(ctx.id) } },
    inputTriggers: { registerSource(value) { source.current = value; return () => { source.current = null; }; } }
  };
  booted.internals.connectComposerRuntime(runtime);
  function addSession(id, cwd = '/w') {
    let state = { draft: '', occurrences: [], phase: 'plain', draftRev: 0 };
    const subscribers = new Set();
    const publish = (next) => { state = { ...state, ...next, draftRev: state.draftRev + 1 }; [...subscribers].forEach((fn) => fn()); };
    const ctx = { id, bail(_subject, name, request) {
      assert.equal(name, 'slash/input-consume-token');
      assert.equal(request.guard.span.draftRev, state.draftRev);
      const own = state.occurrences.find((o) => o.source === 'dsh-file-annotations');
      if (own) publish({ draft: state.draft.slice(0, own.offset) + state.draft.slice(own.offset + own.length), occurrences: [] });
      return true;
    } };
    const calls = [];
    const session = { sessionId: id, prompt: function (...args) {
      calls.push(args);
      return options.prompt ? options.prompt(id, ...args) : Promise.resolve({ ok: true, value: { accepted: true } });
    } };
    const originalPrompt = session.prompt;
    const input = {
      state: { getSnapshot: () => state, subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); } },
      insertReference(reference, span) {
        assert.equal(span.draftRev, state.draftRev);
        const restore = span.start !== span.end;
        if (restore) assert.equal(state.draft.slice(span.start, span.end), reference.clipboardText, 'only the owned persisted token may be replaced');
        const offset = restore ? span.start : state.draft.length;
        publish({ draft: restore ? state.draft : state.draft + reference.clipboardText + ' ', occurrences: [...state.occurrences, {
          ...reference, offset, length: reference.clipboardText.length, occurrenceId: state.draftRev + 1
        }] });
        return true;
      },
      focus() { input.focused = true; }
    };
    const binding = { sessionId: id, session, ctx };
    bindings.set(id, binding); inputs.set(id, input);
    const entry = booted.internals.bindComposerSession(id, cwd, fakeActions());
    return { entry, input, session, calls, originalPrompt, publish, subscribers };
  }
  const a = addSession('s');
  await new Promise((resolve) => setTimeout(resolve, 5));
  return { ...booted, runtime, source, a, addSession };
}

function stageNotes(fixture, notes = [{ id: 'n1', path: '/w/a.ts', rel: 'a.ts', sessionId: 's', quote: 'original text', comment: 'change this' }]) {
  fixture.internals.setItems('/w', notes);
  fixture.internals.syncComposerReference(fixture.a.entry);
}

test('saving notes stages one native reference without submitting or copying the full prompt', async () => {
  const f = await composerFixture();
  f.a.publish({ draft: 'My extra instruction. ' });
  stageNotes(f);
  assert.match(f.a.input.state.getSnapshot().draft, /^My extra instruction\. @dsh-notes-s /);
  assert.equal(f.a.input.state.getSnapshot().occurrences[0].label, '文件批注');
  f.internals.syncComposerReference(f.a.entry);
  assert.equal(f.a.input.state.getSnapshot().occurrences.length, 1, 'reference staging is idempotent');
  assert.equal(f.a.calls.length, 0, 'saving must never send a model message');
  assert.equal(f.internals.itemsOf('/w')[0].sentAt, undefined);
  f.internals.dispose();
});

test('a native submission includes comments and marks them sent only after Host admission', async () => {
  let admit;
  const f = await composerFixture({ prompt: () => new Promise((resolve) => { admit = resolve; }) });
  stageNotes(f);
  const payload = await f.source.current.codec.serialize(f.a.entry.ref);
  assert.match(payload, /original text/); assert.match(payload, /change this/);
  const sending = f.a.session.prompt([{ type: 'text', text: 'Keep the style.\n' + payload }], 'queue');
  assert.equal(f.internals.itemsOf('/w')[0].sentAt, undefined, 'still pending before admission');
  assert.equal(f.internals.getComposerFlight('s').submitting, true);
  admit({ ok: true, value: { accepted: true } });
  await sending;
  assert.equal(typeof f.internals.itemsOf('/w')[0].sentAt, 'number');
  assert.equal(f.internals.pendingFor('/w', 's').length, 0);
  f.internals.dispose();
});

test('Host refusal keeps notes pending and supports an ordinary native retry', async () => {
  let accepted = false;
  const f = await composerFixture({ prompt: async () => ({ ok: accepted }) });
  stageNotes(f);
  let payload = await f.source.current.codec.serialize(f.a.entry.ref);
  await f.a.session.prompt([{ type: 'text', text: payload }], 'queue');
  assert.equal(f.internals.pendingFor('/w', 's').length, 1);
  assert.ok(f.internals.getComposerError('s'));
  accepted = true;
  payload = await f.source.current.codec.serialize(f.a.entry.ref);
  await f.a.session.prompt([{ type: 'text', text: payload }], 'queue');
  assert.equal(f.internals.pendingFor('/w', 's').length, 0);
  assert.equal(f.internals.getComposerError('s'), undefined);
  f.internals.dispose();
});

test('transport rejection preserves the batch and rejects through the native send pipeline', async () => {
  const f = await composerFixture({ prompt: async () => { throw new Error('offline'); } });
  stageNotes(f);
  const payload = await f.source.current.codec.serialize(f.a.entry.ref);
  await assert.rejects(f.a.session.prompt([{ type: 'text', text: payload }], 'queue'), /offline/);
  assert.equal(f.internals.pendingFor('/w', 's').length, 1);
  assert.equal(f.internals.getComposerFlight('s'), undefined);
  f.internals.dispose();
});

test('the batch snapshot excludes later notes and another Session even after navigation', async () => {
  let admit;
  const f = await composerFixture({ prompt: () => new Promise((resolve) => { admit = resolve; }) });
  stageNotes(f);
  const payload = await f.source.current.codec.serialize(f.a.entry.ref);
  f.internals.addAnnotation('/w', { path: '/w/later.ts', comment: 'later', sessionId: 's' });
  f.internals.addAnnotation('/w', { path: '/w/other.ts', comment: 'other', sessionId: 'other' });
  f.internals.setViewRaw({ cwd: '/different', sessionId: 'other', file: null });
  const sending = f.a.session.prompt([{ type: 'text', text: payload }], 'queue');
  admit({ ok: true }); await sending;
  assert.equal(f.internals.pendingFor('/w', 's').length, 1);
  assert.equal(f.internals.pendingFor('/w', 's')[0].comment, 'later');
  assert.equal(f.internals.pendingFor('/w', 'other').length, 1);
  f.internals.dispose();
});

test('duplicate serialization is refused and aborting an unsubmitted attempt releases it', async () => {
  const f = await composerFixture(); stageNotes(f);
  const controller = new AbortController();
  await f.source.current.codec.serialize(f.a.entry.ref, controller.signal);
  await assert.rejects(f.source.current.codec.serialize(f.a.entry.ref), /正在提交/);
  controller.abort();
  assert.equal(f.internals.getComposerFlight('s'), undefined);
  assert.equal(f.internals.pendingFor('/w', 's').length, 1);
  f.internals.dispose();
});

test('removing the last pending note removes only its native reference', async () => {
  const f = await composerFixture(); f.a.publish({ draft: 'Keep my instructions. ' }); stageNotes(f);
  f.internals.removeAnnotation('/w', 'n1');
  f.internals.syncComposerReference(f.a.entry);
  assert.equal(f.a.input.state.getSnapshot().draft.trim(), 'Keep my instructions.');
  assert.equal(f.a.input.state.getSnapshot().occurrences.length, 0);
  f.internals.dispose();
});

test('deleting the blue reference detaches the batch, preserves notes and user text, and stays deleted', async () => {
  const f = await composerFixture(); f.a.publish({ draft: 'Keep my words. ' }); stageNotes(f);
  f.a.publish({ draft: 'Keep my words. ', occurrences: [] });
  f.internals.syncComposerReference(f.a.entry);
  assert.equal(f.a.input.state.getSnapshot().draft, 'Keep my words. ');
  assert.equal(f.internals.pendingFor('/w', 's').length, 0);
  assert.equal(f.internals.itemsOf('/w')[0].detached, true);
  assert.equal(f.internals.itemsOf('/w')[0].sentAt, undefined);
  await assert.rejects(f.source.current.codec.serialize(f.a.entry.ref), /已发送或移除/);
  await f.a.session.prompt([{ type: 'text', text: 'Keep my words.' }]);
  assert.equal(f.internals.itemsOf('/w')[0].sentAt, undefined, 'an ordinary message cannot send detached notes');
  const stored = f.internals.serializeList(f.internals.itemsOf('/w'));
  f.internals.setItems('/w', stored);
  f.internals.syncComposerReference(f.a.entry);
  assert.equal(f.a.input.state.getSnapshot().occurrences.length, 0, 'storage round trip must retain detachment');
  assert.equal(f.internals.adoptAnnotation('/w', 'n1', 's'), true);
  f.internals.syncComposerReference(f.a.entry);
  assert.equal(f.a.input.state.getSnapshot().occurrences.length, 1, 'history can explicitly re-add a note');
  f.internals.dispose();
});

test('new notes stage a fresh batch without resurrecting removed notes', async () => {
  const f = await composerFixture(); stageNotes(f);
  f.a.publish({ draft: '', occurrences: [] });
  f.internals.addAnnotation('/w', { path: '/w/b.json', sessionId: 's', comment: 'new only' });
  f.internals.syncComposerReference(f.a.entry);
  const payload = await f.source.current.codec.serialize(f.a.entry.ref);
  assert.match(payload, /new only/);
  assert.doesNotMatch(payload, /change this/);
  await f.a.session.prompt([{ type: 'text', text: payload }]);
  assert.equal(f.internals.itemsOf('/w')[0].sentAt, undefined);
  f.internals.dispose();
});

test('undoing a reference removal reattaches the preserved batch', async () => {
  const f = await composerFixture(); stageNotes(f);
  const state = f.a.input.state.getSnapshot();
  f.a.publish({ draft: '', occurrences: [] });
  f.a.publish({ draft: state.draft, occurrences: state.occurrences });
  assert.equal(f.internals.pendingFor('/w', 's').length, 1);
  assert.equal(f.internals.itemsOf('/w')[0].detached, undefined);
  f.internals.dispose();
});

test('native optimistic clearing and failed admission do not detach notes', async () => {
  const f = await composerFixture({ prompt: async () => ({ ok: false }) }); stageNotes(f);
  f.a.publish({ phase: 'serializing', draft: '', occurrences: [] });
  assert.equal(f.internals.pendingFor('/w', 's').length, 1);
  const payload = await f.source.current.codec.serialize(f.a.entry.ref);
  f.a.publish({ phase: 'plain' });
  await f.a.session.prompt([{ type: 'text', text: payload }]);
  f.internals.syncComposerReference(f.a.entry);
  assert.equal(f.a.input.state.getSnapshot().occurrences.length, 1);
  assert.equal(f.internals.itemsOf('/w')[0].detached, undefined);
  f.internals.dispose();
});

test('pending comments can be edited but a reserved batch cannot be silently changed', async () => {
  const f = await composerFixture(); stageNotes(f);
  assert.equal(f.internals.updateAnnotation('/w', 'n1', 'updated comment'), true);
  assert.equal(f.internals.updateAnnotation('/w', 'n1', '  '), false);
  const payload = await f.source.current.codec.serialize(f.a.entry.ref);
  assert.match(payload, /updated comment/);
  assert.equal(f.internals.updateAnnotation('/w', 'n1', 'late edit'), false);
  await f.a.session.prompt([{ type: 'text', text: payload }], 'queue');
  f.internals.dispose();
});

test('disposal restores the original public prompt method and releases subscriptions', async () => {
  const f = await composerFixture();
  assert.notEqual(f.a.session.prompt, f.a.originalPrompt);
  f.internals.dispose();
  assert.equal(f.a.session.prompt, f.a.originalPrompt);
  assert.equal(f.a.subscribers.size, 0);
  assert.equal(f.source.current, null);
});

test('load arriving after a local annotation preserves both the Host history and local changes', async () => {
  let finishRead;
  const b = boot({ fetch: async (url) => {
    if (url.endsWith('/read')) return new Promise((resolve) => { finishRead = () => resolve({ ok: true, json: async () => ({ ok: true, value: { annotations: [{ id: 'history', path: '/w/old.ts', comment: 'old', sessionId: 's', sentAt: 1 }] } }) }); });
    return { ok: true, json: async () => ({ ok: true, value: {} }) };
  } });
  b.internals.setViewRaw({ cwd: '/w', sessionId: 's', file: '/w/a.ts' });
  b.internals.openPanel({ cwd: '/w' });
  b.internals.addAnnotation('/w', { path: '/w/new.ts', sessionId: 's', comment: 'new' });
  finishRead(); await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(b.internals.itemsOf('/w').length, 2);
  assert.equal(b.internals.pendingFor('/w', 's').length, 1);
  b.internals.dispose();
});


test('a persisted annotation token is restored as one chip without duplicating the draft', async () => {
  const f = await composerFixture();
  f.a.publish({ draft: 'Please check. @dsh-notes-s ', occurrences: [] });
  stageNotes(f);
  const state = f.a.input.state.getSnapshot();
  assert.equal(state.draft, 'Please check. @dsh-notes-s ');
  assert.equal(state.occurrences.length, 1);
  const payload = await f.source.current.codec.serialize(f.a.entry.ref);
  assert.match(payload, /change this/);
  await f.a.session.prompt([{ type: 'text', text: payload }], 'queue');
  f.internals.dispose();
});

test('an unfinished pending-card edit blocks serialization without losing the note', async () => {
  const f = await composerFixture(); stageNotes(f);
  f.internals.setEditingNote('n1', true);
  await assert.rejects(f.source.current.codec.serialize(f.a.entry.ref), /先保存或取消/);
  assert.equal(f.internals.getComposerFlight('s'), undefined);
  assert.equal(f.internals.pendingFor('/w', 's').length, 1);
  f.internals.setEditingNote('n1', false);
  const payload = await f.source.current.codec.serialize(f.a.entry.ref);
  await f.a.session.prompt([{ type: 'text', text: payload }], 'queue');
  f.internals.dispose();
});

test('restoring a draft after another reference owner refuses releases the reserved batch', async () => {
  const f = await composerFixture(); stageNotes(f);
  await f.source.current.codec.serialize(f.a.entry.ref);
  f.a.publish({ draft: f.a.input.state.getSnapshot().draft });
  assert.equal(f.internals.getComposerFlight('s'), undefined);
  assert.equal(f.internals.pendingFor('/w', 's').length, 1);
  f.internals.dispose();
});

test('unloading removes the owned reference while preserving user instructions', async () => {
  const f = await composerFixture(); f.a.publish({ draft: 'Keep my words. ' }); stageNotes(f);
  f.internals.dispose();
  assert.equal(f.a.input.state.getSnapshot().draft.trim(), 'Keep my words.');
});

test('a hidden retained preview leaves no annotation badges over the main composer', () => {
  const f = boot();
  const { outlet } = previewFixture(f);
  let hidden = false;
  f.window.getComputedStyle = (node) => ({ visibility: node === outlet && hidden ? 'hidden' : 'visible', display: 'block', overflowX: 'visible', overflowY: 'visible' });
  f.internals.setItems('/w', [{ id: '1', path: '/w/a.ts', sessionId: 's', comment: 'note' }]);
  assert.ok(f.document.body.findByMark('mark'));
  hidden = true;
  f.internals.openPanel({ cwd: '/w' });
  assert.equal(f.document.body.findByMark('mark'), null);
  hidden = false;
  f.internals.openPanel({ cwd: '/w' });
  assert.ok(f.document.body.findByMark('mark'));
  f.internals.dispose();
});

test('the viewport marker layer never cancels Electron window dragging', () => {
  const { internals } = boot();
  assert.doesNotMatch(internals.CSS, /\[data-dsh-file-annotations\]\{-webkit-app-region:no-drag/);
  assert.match(internals.CSS, /\[data-dsh-file-annotations="marks"\]\{-webkit-app-region:initial!important;\}/);
});

test('clicking either header entry twice toggles the same history panel closed', () => {
  for (const slot of ['sidebar.right.tab.files.actions', 'sidebar.right.tab.document.actions']) {
    const f = boot(); const m = mount(f);
    f.internals.setViewRaw({ cwd: '/w', sessionId: 's', file: '/w/a.ts', rel: 'a.ts' });
    const button = renderEntry(f, m, slot, { absolutePath: slot.includes('.files.') ? '/w' : '/w/a.ts', sessionId: 's' });
    const event = { preventDefault() {}, stopPropagation() {} };
    button.props.onClick(event);
    assert.equal(f.internals.isPanelOpen(), true);
    button.props.onClick(event);
    assert.equal(f.internals.isPanelOpen(), false);
    f.internals.dispose();
  }
});

test('a region remains visible while writing, follows its carrier, and clears on cancel', () => {
  const f = boot(); const { preview } = previewFixture(f, 'iframe', '/w/a.html');
  let y = 50;
  preview.getBoundingClientRect = () => ({ left: 30, top: y, right: 290, bottom: y + 300, width: 260, height: 300 });
  f.internals.beginRegionDrag(50, 100); f.internals.finishRegionDrag(180, 180);
  let box = f.document.body.findByMark('draftRegion');
  assert.ok(box, 'release must retain the selected region, not just open an editor');
  assert.equal(box.style.top, '100px');
  y += 20; f.internals.syncDraftRegion();
  box = f.document.body.findByMark('draftRegion');
  assert.equal(box.style.top, '120px', 'region stays attached to preview when it moves');
  f.document.body.findByMark('ghost').click();
  assert.equal(f.document.body.findByMark('draftRegion'), null);
  assert.equal(f.internals.itemsOf('/w').length, 0);
  f.internals.dispose();
});

test('the selection shortcut ignores composition and outside selections', () => {
  const f = boot(); const { preview } = previewFixture(f);
  f.window.getSelection = () => selectionIn(preview, 'selected words');
  let consumed = 0;
  const key = { key: 'E', code: 'KeyE', metaKey: true, shiftKey: true, target: preview,
    preventDefault() { consumed++; }, stopPropagation() {} };
  f.document.emit('keydown', { ...key, isComposing: true });
  assert.equal(f.document.body.findByMark('inline'), null);
  f.document.emit('keydown', key);
  assert.ok(f.document.body.findByMark('inline'));
  assert.equal(consumed, 1);
  f.document.body.findByMark('ghost').click();
  const elsewhere = f.document.createElement('pre'); f.document.body.appendChild(elsewhere);
  f.window.getSelection = () => selectionIn(elsewhere, 'outside');
  f.document.emit('keydown', key);
  assert.equal(f.document.body.findByMark('inline'), null);
  f.internals.dispose();
});

test('the desktop shortcut is registered through DSH, scoped to preview selection, and disposed', () => {
  const f = boot(); const { preview } = previewFixture(f);
  let command; let removed = 0; let unsubscribed = 0;
  const off = f.internals.connectShortcuts({
    register(value) { command = value; return () => { removed++; }; },
    catalog: { getSnapshot() { return [{ id: 'dsh-file-annotations.annotate-selection', keys: ['⌘', '⇧', 'E'], binding: { code: 'KeyE', modifiers: ['meta', 'shift'] }, conflicts: [], issue: null }]; },
      subscribe() { return () => { unsubscribed++; }; } }
  });
  assert.deepEqual([...command.defaults['desktop:macos'].modifiers], ['primary', 'shift']);
  assert.equal(command.defaults['web:linux'], undefined, 'DSH rejects letter shortcuts for Linux Web across all-platform registration');
  assert.equal(command.resolve().status, 'pass');
  f.window.getSelection = () => selectionIn(preview, 'desktop selection');
  assert.equal(command.resolve().status, 'handled');
  f.document.emit('keydown', { key: 'E', code: 'KeyE', metaKey: true, shiftKey: true, target: preview, preventDefault() {}, stopPropagation() {} });
  assert.ok(f.document.body.findByMark('inline'));
  assert.equal(command.resolve().status, 'pass', 'must not replace an unfinished comment');
  off(); assert.equal(removed, 1); assert.equal(unsubscribed, 1);
  f.internals.dispose();
});

test('capture arbitration honors the DSH configured shortcut and disabling it', () => {
  const f = boot(); const { preview } = previewFixture(f);
  f.window.getSelection = () => selectionIn(preview, 'selected');
  let update; let binding = { code: 'KeyJ', modifiers: ['meta', 'shift'] };
  const off = f.internals.connectShortcuts({ register() { return () => {}; }, catalog: {
    getSnapshot() { return [{ id: 'dsh-file-annotations.annotate-selection', keys: binding ? ['⌘', '⇧', 'J'] : [], binding, issue: null, conflicts: [] }]; },
    subscribe(fn) { update = fn; return () => {}; }
  } });
  const key = { key: 'E', code: 'KeyE', metaKey: true, shiftKey: true, target: preview, preventDefault() {}, stopPropagation() {} };
  f.document.emit('keydown', key);
  assert.equal(f.document.body.findByMark('inline'), null, 'must not keep the default after remapping');
  f.document.emit('keydown', { ...key, key: 'J', code: 'KeyJ' });
  assert.ok(f.document.body.findByMark('inline'));
  f.document.body.findByMark('ghost').click();
  binding = null; update();
  f.document.emit('keydown', { ...key, key: 'J', code: 'KeyJ' });
  assert.equal(f.document.body.findByMark('inline'), null, 'cleared binding disables capture too');
  off(); f.internals.dispose();
});

test('send-all uses the native input transaction without marking records sent on its own', async () => {
  const f = await composerFixture(); stageNotes(f);
  const calls = [];
  f.a.input.submit = (...args) => calls.push({ args, state: f.a.input.state.getSnapshot() });
  assert.equal(f.internals.submitPending('s', '/other'), false);
  assert.equal(f.internals.submitPending('s', '/w'), true);
  assert.deepEqual(calls[0].args, ['queue', 'click']);
  assert.equal(calls[0].state.occurrences.length, 1);
  assert.equal(f.a.calls.length, 0, 'the plugin never bypasses the native input');
  assert.equal(f.internals.itemsOf('/w')[0].sentAt, undefined);
  f.internals.setEditingNote('n1', true);
  assert.equal(f.internals.submitPending('s', '/w'), false);
  assert.equal(calls.length, 1);
  f.internals.dispose();
});

test('Cmd+Enter saves the active note then submits all notes, with IME and repeat guards', async () => {
  const f = await composerFixture(); const { preview } = previewFixture(f);
  stageNotes(f);
  let submits = 0;
  f.a.input.submit = () => { submits++; assert.equal(f.internals.pendingFor('/w', 's').length, 2); };
  f.window.getSelection = () => selectionIn(preview, 'new selection');
  f.internals.evaluateSelection(); f.document.body.findByMark('pop').click();
  const input = f.document.body.findByMark('inlineInput'); input.value = 'new comment';
  const event = { key: 'Enter', metaKey: true, target: input, preventDefault() {}, stopPropagation() {} };
  f.document.emit('keydown', { ...event, isComposing: true });
  f.document.emit('keydown', { ...event, repeat: true });
  assert.equal(submits, 0);
  f.document.emit('keydown', event);
  assert.equal(submits, 1);
  assert.equal(f.document.body.findByMark('inline'), null);
  assert.equal(f.internals.pendingFor('/w', 's')[1].comment, 'new comment');
  assert.equal(f.internals.pendingFor('/w', 's').length, 2, 'admission still owns sentAt');
  f.internals.dispose();
});

function textDomFixture(f, chunks, pdfPage) {
  const { outlet, preview } = previewFixture(f, 'div', pdfPage ? '/w/review.pdf' : '/w/review.txt');
  preview.setAttribute(pdfPage ? 'data-pdf-page' : 'data-textpreview-plain', String(pdfPage || ''));
  const nodes = chunks.map((value) => {
    const span = f.document.createElement('span');
    const text = f.document.createElement('text'); text.nodeType = 3; text.nodeValue = value;
    span.appendChild(text); preview.appendChild(span); return text;
  });
  f.document.createTreeWalker = (root) => {
    const all = []; const walk = (node) => { for (const child of node.children) { if (child.nodeType === 3) all.push(child); else walk(child); } }; walk(root);
    let next = 0; return { nextNode: () => all[next++] ?? null };
  };
  f.document.createRange = () => {
    const range = { setStart(node, offset) { this.startContainer = node; this.startOffset = offset; },
      setEnd(node, offset) { this.endContainer = node; this.endOffset = offset; },
      getClientRects() { return [{ left: 80, top: 120, right: 190, bottom: 140, width: 110, height: 20 }]; }
    }; f.document.lastRange = range; return range;
  };
  return { outlet, preview, nodes };
}

test('PDF quotes spanning separate Chinese text nodes map to their actual endpoints', () => {
  const f = boot(); const { preview, nodes } = textDomFixture(f, ['电动', '力学\n', '第三章', '静电场'], 4);
  const index = f.internals.textIndex(preview);
  const found = f.internals.textMatch(index, '动力学\n第 三章');
  const range = f.internals.rangeFromMatch(index, found);
  assert.equal(range.startContainer, nodes[0]); assert.equal(range.startOffset, 1);
  assert.equal(range.endContainer, nodes[2]); assert.equal(range.endOffset, 3);
  f.internals.dispose();
});

test('repeated quotes retain occurrence context and survive serialization', () => {
  const f = boot(); const { preview, nodes } = textDomFixture(f, ['First same ', 'phrase end. ', 'Second same ', 'phrase tail.']);
  const anchor = f.internals.captureTextAnchor({ startContainer: nodes[2], startOffset: 7 }, 'same phrase');
  assert.ok(anchor); assert.match(anchor.prefix, /Second$/);
  const found = f.internals.textMatch(f.internals.textIndex(preview), 'same phrase', anchor);
  const range = f.internals.rangeFromMatch(f.internals.textIndex(preview), found);
  assert.equal(range.startContainer, nodes[2], 'must not jump to the first identical phrase');
  const note = f.internals.addAnnotation('/w', { path: '/w/review.txt', quote: 'same phrase', comment: 'second occurrence', anchor });
  assert.equal(f.internals.parseList(JSON.stringify(f.internals.serializeList([note])))[0].anchor.start, anchor.start);
  f.internals.dispose();
});

test('quoted text gets a highlight and badge at the range instead of the page rail', () => {
  const f = boot(); textDomFixture(f, ['电动', '力学第三章']);
  f.internals.addAnnotation('/w', { path: '/w/review.txt', quote: '动力学', comment: 'target' });
  const mark = f.document.body.findByMark('mark');
  assert.ok(f.document.body.findByMark('textHighlight'));
  assert.equal(mark.style.left, '195px');
  assert.equal(mark.style.top, '120.5px');
  f.internals.dispose();
});

test('a hidden retained pane cannot capture TXT selection from the visible code viewer', () => {
  const f = boot(); const hidden = f.document.createElement('div');
  hidden.setAttribute('data-slot', 'sidebar.right.pane.tab'); hidden.setAttribute('hidden', ''); f.document.body.appendChild(hidden);
  const { preview, outlet } = previewFixture(f, 'div', '/w/notes.txt'); preview.setAttribute('data-code-preview', '');
  const content = f.document.createElement('div'); content.setAttribute('contenteditable', 'true'); preview.appendChild(content);
  f.window.getSelection = () => selectionIn(content, 'TXT selection');
  assert.equal(f.internals.paneElement(), outlet);
  assert.equal(f.internals.evaluateSelection(), true);
  assert.ok(f.document.body.findByMark('pop'));
  f.internals.dispose();
});

test('Better Sidebar CodeMirror is annotatable while ordinary form inputs remain excluded', () => {
  const f = boot(); const { preview } = previewFixture(f, 'div', '/w/notes.json');
  preview.setAttribute('data-annotation-preview', 'better-sidebar');
  const content = f.document.createElement('div'); content.setAttribute('class', 'cm-content');
  content.setAttribute('contenteditable', 'true'); preview.appendChild(content);
  f.window.getSelection = () => selectionIn(content, 'JSON selected value');
  assert.equal(f.internals.evaluateSelection(), true);
  assert.ok(f.document.body.findByMark('pop'));
  const search = f.document.createElement('input'); content.appendChild(search);
  f.window.getSelection = () => selectionIn(search, 'search query');
  assert.equal(f.internals.evaluateSelection(), false);
  assert.equal(f.document.body.findByMark('pop'), null);
  f.internals.dispose();
});

test('a closing native panel removes markers before its visibility animation ends', () => {
  const f = boot(); const { outlet } = previewFixture(f);
  const panel = f.document.createElement('section'); panel.setAttribute('data-sidebar-right-panel', 'push');
  panel.setAttribute('data-sidebar-right-open', 'true');
  outlet.parentElement.removeChild(outlet); panel.appendChild(outlet); f.document.body.appendChild(panel);
  f.internals.setItems('/w', [{ id: 'close', path: '/w/a.ts', sessionId: 's', comment: 'note' }]);
  assert.ok(f.document.body.findByMark('mark'));
  panel.removeAttribute('data-sidebar-right-open');
  f.internals.openPanel({ cwd: '/w' });
  assert.equal(f.document.body.findByMark('mark'), null);
  f.internals.dispose();
});

test('Better Sidebar adapter decorates the public viewers and disposes without modifying originals', () => {
  const f = boot(); const listeners = new Set(); const records = new Map(); let enabled = true;
  const original = { id: 'code', exts: [], priority: -100, fetchStrategy: 'fsRead', component: () => null };
  records.set(original.id, original);
  const notify = () => [...listeners].forEach(fn => fn());
  const service = {
    getFileViewers: () => [...records.values()], isViewerEnabled: () => enabled,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    registerFileViewer(row) { assert.equal(records.has(row.id), false); records.set(row.id, row); notify(); return () => { records.delete(row.id); notify(); }; }
  };
  const off = f.internals.connectBetterSidebar(service);
  assert.equal(records.get('code'), original);
  assert.equal(records.size, 2);
  const wrapper = records.get('dsh-file-annotations:viewer:code');
  assert.ok(wrapper.priority > original.priority);
  const props = { scope: { cwd: '/w', sessionId: 's' }, path: '/w/a.json', content: '{}' };
  const rendered = wrapper.component(props);
  assert.equal(rendered.props.original, original);
  assert.equal(rendered.props.fileProps, props);
  enabled = false; notify(); assert.equal(records.size, 1);
  enabled = true; notify(); assert.equal(records.size, 2);
  off(); assert.equal(records.size, 1); assert.equal(listeners.size, 0);
  f.internals.dispose();
});

test('HTML annotation toolbar has no plain-text switch and preserves the original rendered viewer', () => {
  const f = boot();
  const original = { id: 'html', component: () => null };
  const tree = f.internals.BetterAnnotationViewer({ original, fileProps: { scope: { cwd: '/w', sessionId: 's' }, path: '/w/a.html', content: 'html' } });
  assert.equal(tree.props['data-annotation-preview'], 'better-sidebar');
  assert.equal(tree.children.length, 2, 'there is no alternative extracted-text layer');
  assert.equal(tree.children[0].children.length, 1, 'only document annotation controls remain');
  assert.equal(tree.children[0].children[0].props.requireHtmlBridge, true);
  assert.equal(tree.children[1].props.style.flexDirection, 'column');
  assert.equal(tree.children[1].children[0].type, original.component);
  assert.equal(tree.children[1].children[0].props.viewerId, 'html');
  f.internals.dispose();
});

test('an old source file is annotated and sent in the on-screen conversation workspace', async () => {
  const f = await composerFixture();
  f.runtime.sidebarRight = { mounted: { getSnapshot: () => 's' } };
  f.internals.rememberCwd('old', '/legacy');
  const { outlet, preview } = previewFixture(f, 'pre', '/legacy/old.txt');
  const action = f.document.createElement('button'); action.setAttribute(MARK, 'action');
  action.setAttribute('data-annotation-file', '/legacy/old.txt'); action.setAttribute('data-annotation-owner', 'old'); outlet.appendChild(action);
  f.window.getSelection = () => selectionIn(preview, 'old file text');
  f.internals.evaluateSelection(); f.document.body.findByMark('pop').click();
  const input = f.document.body.findByMark('inlineInput'); input.value = 'new review of old file';
  let submissions = 0; f.a.input.submit = () => { submissions++; };
  f.document.emit('keydown', { key: 'Enter', metaKey: true, target: input, preventDefault() {}, stopPropagation() {} });
  assert.equal(submissions, 1);
  const [note] = f.internals.pendingFor('/w', 's');
  assert.equal(note.path, '/legacy/old.txt'); assert.equal(note.sessionId, 's');
  assert.equal(f.internals.itemsOf('/legacy').length, 0, 'source provenance must not steal destination ownership');
  f.internals.dispose();
});

test('the pending dock resolves its workspace without any preview or file tree', async () => {
  const effects = [];
  const react = { ...reactStub, useEffect(fn) { effects.push(fn); } };
  const f = boot({ react, fetch: async (url) => ({ ok: true, json: async () => ({ ok: true,
    value: String(url).endsWith('/resolve') ? { cwd: '/fresh' } : { annotations: [] } }) }) });
  f.internals.PendingAnnotations({ sessionId: 'cold-chat' });
  const cleanups = effects.map((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(f.internals.cachedCwd('cold-chat'), '/fresh');
  assert.equal(f.internals.getView().file, null);
  cleanups.forEach((fn) => { if (typeof fn === 'function') fn(); }); f.internals.dispose();
});

test('history can recover a legacy pending note only through explicit reassignment', () => {
  const f = boot();
  f.internals.setItems('/w', [{ id: 'old', path: '/w/a.txt', sessionId: 'earlier', comment: 'recover' },
    { id: 'sent', path: '/w/a.txt', sessionId: 'earlier', comment: 'already sent', sentAt: 1 }]);
  assert.equal(f.internals.pendingFor('/w', 's').length, 0);
  assert.equal(f.internals.adoptAnnotation('/w', 'old', 's'), true);
  assert.equal(f.internals.pendingFor('/w', 's').length, 1);
  assert.equal(f.internals.adoptAnnotation('/w', 'sent', 's'), false);
  f.internals.dispose();
});

function shortcutPresetFixture(f, failSecond = false) {
  let snapshot = { status: 'ready', revision: 'r0', document: { schemaVersion: 2, profiles: {} } };
  let rows = [{ id: 'workspace.files', binding: { code: 'KeyP', modifiers: ['meta'] } },
    { id: 'dsh-file-annotations.annotate-selection', binding: { code: 'KeyE', modifiers: ['shift', 'meta'] } }];
  const calls = [];
  const service = { runtime: 'desktop', platform: 'macos', catalog: { getSnapshot: () => rows, subscribe: () => () => {} },
    config: { getSnapshot: () => snapshot, subscribe: () => () => {} },
    async edit(edit, revision) {
      assert.equal(revision, snapshot.revision); calls.push(edit);
      if (failSecond && calls.length === 2) return { status: 'conflict', snapshot };
      rows = rows.map((row) => row.id === edit.id ? { ...row, binding: edit.binding || { code: 'KeyP', modifiers: ['meta'] } } : row);
      snapshot = { ...snapshot, revision: 'r' + calls.length };
      return { status: 'saved', snapshot };
    }
  };
  return { service, calls };
}

test('Desktop preset moves file opening to Cmd+O then annotation to Cmd+P once', async () => {
  const f = boot(); const preset = shortcutPresetFixture(f);
  const stop = f.internals.installShortcutPreset(preset.service);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(preset.calls.length, 2);
  assert.equal(preset.calls[0].id, 'workspace.files'); assert.equal(preset.calls[0].binding.code, 'KeyO');
  assert.equal(preset.calls[1].binding.code, 'KeyP');
  stop(); f.internals.installShortcutPreset(preset.service)();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(preset.calls.length, 2, 'a later user preference must not be rewritten on every startup');
  f.internals.dispose();
});

test('Desktop preset rolls file opening back if assigning Cmd+P is refused', async () => {
  const f = boot(); const preset = shortcutPresetFixture(f, true);
  const stop = f.internals.installShortcutPreset(preset.service);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(preset.calls.length, 3); assert.equal(preset.calls[2].type, 'reset');
  assert.equal(preset.calls[2].id, 'workspace.files');
  stop(); f.internals.dispose();
});

test('Desktop preset retries a revision invalidated while native catalogs load', async () => {
  const f = boot(); const preset = shortcutPresetFixture(f);
  const edit = preset.service.edit; let first = true;
  preset.service.edit = async (...args) => {
    if (first) { first = false; return { status: 'stale', snapshot: preset.service.config.getSnapshot() }; }
    return edit(...args);
  };
  const stop = f.internals.installShortcutPreset(preset.service);
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(preset.calls.length, 2); assert.equal(preset.calls[1].binding.code, 'KeyP');
  stop(); f.internals.dispose();
});

function frameRuntimeFixture() {
  const f = boot(), callbacks = new Map(), messages = [];
  const parent = {};
  const port = { postMessage: message => messages.push(message), start() {}, close() {} };
  let top = 100, text = 'Target paragraph', overflow = 'visible';
  const body = { parentElement: null, getBoundingClientRect: () => ({ left: 0, top: 0, right: 400, bottom: 2000 }), tagName: 'BODY' };
  const target = { id: 'target', tagName: 'P', parentElement: body, previousElementSibling: null,
    scrollLeft: 0, scrollTop: 0, scrollWidth: 400, scrollHeight: 200, clientWidth: 400, clientHeight: 200,
    get innerText() { return text; }, get textContent() { return text; }, closest: () => null, contains: e => e === target,
    getClientRects: () => [{}], getBoundingClientRect: () => ({ left: 0, top, right: 400, bottom: top + 200, width: 400, height: 200 }) };
  const root = new MockNode('html'); root.setPointerCapture = () => {}; root.releasePointerCapture = () => {};
  const doc = { body, readyState: 'complete', documentElement: root, createElement: tag => new MockNode(tag),
    querySelectorAll: () => [target], querySelector: selector => ['#target','body > p:nth-of-type(1)'].includes(selector) ? target : null,
    elementFromPoint: () => target, addEventListener() {} };
  vm.runInNewContext('(' + f.internals.htmlFrameRuntime.toString() + ') ("key", "http://app.test")', {
    parent, document: doc, innerWidth: 400, innerHeight: 500, CSS: { escape: value => value },
    getComputedStyle: el => ({ display: 'block', visibility: 'visible', overflowX: 'visible', overflowY: el === target ? overflow : 'visible' }),
    addEventListener(type, callback) { callbacks.set(type, callback); }, requestAnimationFrame: callback => callback(),
    MutationObserver: class { observe() {} }, setTimeout, getSelection: () => null,
  });
  callbacks.get('message')({ isTrusted:true, source:parent, origin:'http://app.test',ports:[port],stopImmediatePropagation(){},data:{channel:'dsh-html-annotations',key:'key',type:'connect'} });
  const message = data => port.onmessage({ data: { channel: 'dsh-html-annotations', key: 'key', ...data } });
  const pointer = (type, x, y) => callbacks.get(type)({ button: 0, isPrimary: true, pointerId: 1, clientX: x, clientY: y, preventDefault() {}, stopImmediatePropagation() {} });
  const last = type => [...messages].reverse().find(message => message.type === type);
  return { ...f, callbacks, messages, parent, target, message, pointer, last, overlayRoot: root,
    setTop(value) { top = value; }, setText(value) { text = value; }, setOverflow(value) { overflow = value; }, setScrollingRoot() { doc.scrollingElement = target; } };
}

test('HTML element hover previews a clipped border and clears on leave, scroll and Escape', () => {
  const f = frameRuntimeFixture(); f.message({type:'mode',mode:'element'});
  f.pointer('pointermove', 30, 120);
  let outline = f.overlayRoot.children[0]; assert.ok(outline);
  assert.equal(outline.style.top, '100px'); assert.equal(outline.style.height, '200px');
  f.callbacks.get('pointerout')({relatedTarget:null}); assert.equal(f.overlayRoot.children.length, 0);
  f.setTop(-100); f.pointer('pointermove', 30, 20);
  outline = f.overlayRoot.children[0]; assert.equal(outline.style.top, '0px'); assert.equal(outline.style.height, '100px');
  f.callbacks.get('scroll')(); assert.equal(f.overlayRoot.children.length, 0);
  f.pointer('pointermove', 30, 20); f.callbacks.get('keydown')({key:'Escape'});
  assert.equal(f.overlayRoot.children.length, 0); assert.equal(f.last('cancel').type, 'cancel');
  f.pointer('pointermove', 30, 20); assert.equal(f.overlayRoot.children.length, 0);
  f.internals.dispose();
});

test('HTML uses named icon controls and a keyboard-accessible box menu with outside/escape cleanup', () => {
  const f = boot(); const { preview } = previewFixture(f, 'iframe', '/w/a.html');
  const tree = f.internals.HtmlSelectionTools({activate(){}});
  const [pick, more] = tree.children;
  assert.equal(pick.props['aria-label'], '选择网页元素'); assert.equal(pick.props.title, '选择网页元素');
  assert.equal(pick.children[0].type, 'svg'); assert.equal(more.props['aria-haspopup'], 'menu');
  const anchor = f.document.createElement('button'); f.document.body.appendChild(anchor);
  f.internals.toggleHtmlMenu(anchor);
  let menu = f.document.body.findByMark('toolMenu'); const item = f.document.body.findByMark('toolMenuItem');
  assert.equal(menu.getAttribute('role'), 'menu'); assert.equal(item.getAttribute('role'), 'menuitemcheckbox');
  assert.equal(item.focused, true); item.click(); assert.equal(f.internals.getRegionMode(), true);
  assert.equal(f.document.body.findByMark('toolMenu'), null);
  f.document.emit('keydown', {key:'Escape'}); assert.equal(f.internals.getRegionMode(), false);
  f.internals.toggleHtmlMenu(anchor); f.document.emit('keydown', {key:'Escape'});
  assert.equal(f.document.body.findByMark('toolMenu'), null); assert.equal(anchor.focused, true);
  assert.equal(anchor.getAttribute('aria-expanded'), 'false');
  f.internals.toggleHtmlMenu(anchor); f.document.body.findByMark('toolMenu').emit('keydown', {key:'Tab'});
  assert.equal(f.document.body.findByMark('toolMenu'), null); assert.equal(anchor.focused, true);
  f.internals.toggleHtmlMenu(anchor); f.document.emit('pointerdown', {button:0,target:preview});
  assert.equal(f.document.body.findByMark('toolMenu'), null);
  f.internals.toggleHtmlMenu(anchor); f.internals.dispose();
  assert.equal(f.document.body.findByMark('toolMenu'), null); assert.equal(anchor.getAttribute('aria-expanded'), 'false');
});

test('HTML element picks are anchored to DOM identity and follow page scrolling', () => {
  const f = frameRuntimeFixture(); f.message({ type: 'mode', mode: 'element' });
  f.pointer('pointerdown', 20, 120); f.pointer('pointerup', 20, 120);
  const pick = f.last('pick').selection;
  assert.equal(pick.htmlAnchor.selector, '#target'); assert.equal(pick.htmlAnchor.kind, 'element');
  f.message({ type: 'notes', notes: [{ id: 'n', ...pick }] });
  assert.equal(f.last('geometry').items[0].rects[0].top, 100);
  f.setTop(20); f.callbacks.get('scroll')();
  assert.equal(f.last('geometry').items[0].rects[0].top, 20);
  f.setTop(-250); f.callbacks.get('scroll')();
  assert.equal(f.last('geometry').items[0].rects.length, 0, 'off-screen elements must not leave a floating box');
  f.internals.dispose();
});

test('HTML box gestures retain element-relative coordinates and clip nested scrolling', () => {
  const f = frameRuntimeFixture(); f.message({ type: 'mode', mode: 'box' });
  f.pointer('pointerdown', 40, 120); f.pointer('pointerup', 140, 170);
  const pick = f.last('pick').selection;
  assert.equal(pick.htmlAnchor.kind, 'region'); assert.equal(pick.htmlAnchor.selector, '#target');
  assert.equal(pick.region.x, 0.1); assert.equal(pick.region.y, 0.1); assert.equal(pick.region.h, 0.25);
  f.message({ type: 'notes', notes: [{ id: 'box', ...pick }] });
  assert.equal(f.last('geometry').items[0].rects[0].top, 120);
  f.setOverflow('auto'); f.target.scrollTop = 40; f.callbacks.get('scroll')();
  assert.equal(f.last('geometry').items[0].rects[0].top, 100);
  assert.equal(f.last('geometry').items[0].rects[0].height, 30);
  f.target.scrollTop = 100; f.callbacks.get('scroll')();
  assert.equal(f.last('geometry').items[0].rects.length, 0);
  f.internals.dispose();
});

test('HTML positional anchors refuse unrelated replacement elements', () => {
  const f = frameRuntimeFixture();
  f.message({ type: 'notes', notes: [{ id: 'n', htmlAnchor: {kind:'element',selector:'body > p:nth-of-type(1)',text:'Target paragraph'} }] });
  assert.equal(f.last('geometry').items[0].rects.length, 1);
  f.setText('Entirely different element'); f.callbacks.get('scroll')();
  assert.equal(f.last('geometry').items[0].rects.length, 0);
  f.internals.dispose();
});

test('HTML frame ignores commands from a different parent or origin', () => {
  const f = frameRuntimeFixture();
  for (const event of [{source:{},origin:'http://app.test'}, {source:f.parent,origin:'http://evil.test'}]) {
    f.callbacks.get('message')({...event,data:{channel:'dsh-html-annotations',key:'key',type:'mode',mode:'element'}});
    f.pointer('pointerdown',20,120); f.pointer('pointerup',20,120);
    assert.equal(f.last('pick'), undefined);
  }
  f.internals.dispose();
});

async function parentHtmlFixture(options = {}) {
  const f = boot(); const { preview, outlet } = previewFixture(f,'div','/w/a.html');
  const frame = f.document.createElement('iframe'); preview.appendChild(frame);
  frame.setAttribute('src',options.source || 'http://127.0.0.1/sidebar/html/s/w/a.html');
  frame.setAttribute('sandbox',options.sandbox === undefined ? 'allow-scripts allow-popups allow-downloads allow-modals' : options.sandbox);
  const sent = []; frame.contentWindow = { postMessage: data => sent.push(data) };
  f.window.location = {href:'http://127.0.0.1/',origin:'http://127.0.0.1'};
  f.window.MutationObserver = class { observe() {} disconnect() {} };
  const nodes=[];
  f.window.DOMParser = class { parseFromString() {return {createElement: tag => ({tag}),head:{querySelector:()=>null,prepend(...items){nodes.push(...items);}},documentElement:{outerHTML:'<html><body>preview</body></html>'}};} };
  f.window.fetch = async () => ({ok:true,headers:{get:()=>options.policy || null},text:async()=>'<h1>preview</h1>'});
  const off = f.internals.attachHtmlPreview(preview,()=>({cwd:'/w',path:'/w/a.html',rel:'a.html',sessionId:'s'}));
  await new Promise(resolve=>setTimeout(resolve,0));
  const entry = f.internals.htmlEntry(frame);
  if(entry) entry.port={postMessage:data=>sent.push(data),close(){}};
  const emit = (type, more = {}, source = frame.contentWindow, origin = 'null', port = entry.port) => f.internals.onHtmlMessage({source,origin,data:{channel:'dsh-html-annotations',key:entry.key,type,...more}},port);
  return {...f,frame,entry,sent,off,emit,outlet,nodes};
}

test('parent HTML bridge requires frame identity and opaque origin; selection alone cannot save or send', async () => {
  const f = await parentHtmlFixture();
  f.emit('ready',{},{}); assert.equal(f.entry.ready,false);
  f.emit('ready',{},f.frame.contentWindow,'http://evil.test'); assert.equal(f.entry.ready,false);
  f.emit('ready',{},f.frame.contentWindow,'null',{}); assert.equal(f.entry.ready,false);
  f.emit('ready'); assert.equal(f.entry.ready,true);
  const selection = {quote:'preview',htmlAnchor:{kind:'text',selector:'h1',start:0,end:7},rect:{left:10,top:20,width:80,height:20}};
  f.emit('selection',{selection,viewport:{width:320,height:420}});
  assert.ok(f.document.body.findByMark('pop'));
  assert.equal(f.document.body.findByMark('inline'),null);
  assert.equal(f.internals.itemsOf('/w').length,0);
  f.document.body.findByMark('pop').click();
  assert.ok(f.document.body.findByMark('inline'));
  f.document.body.findByMark('inlineInput').value = 'comment';
  f.document.body.findByMark('inlineSave').click();
  assert.equal(f.internals.itemsOf('/w')[0].htmlAnchor.selector,'h1');
  assert.equal(f.internals.itemsOf('/w')[0].sentAt,undefined);
  f.off(); assert.equal(f.internals.htmlEntry(f.frame),undefined);
  f.internals.dispose();
});

test('HTML anchor metadata survives serialization and adds useful element location to the prompt', () => {
  const f = boot(); const htmlAnchor = {kind:'element',selector:'#hero',tag:'section',text:'Hero'};
  const note = f.internals.makeRecord({path:'/w/a.html',comment:'change layout',quote:'Hero',htmlAnchor,region:{kind:'html',x:0,y:0,w:1,h:1}});
  const list = f.internals.parseList(JSON.stringify({annotations:[note]}));
  assert.equal(list[0].htmlAnchor.selector,'#hero');
  assert.match(f.internals.buildPrompt(list),/网页元素：#hero <section>/);
  assert.match(f.internals.buildPrompt(list),/元素文字：`Hero`/);
  assert.equal(f.internals.normalizeHtmlAnchor({kind:'text',selector:'#x',start:-1,end:3}),null);
  assert.equal(f.internals.normalizeHtmlAnchor({kind:'element',selector:'x'.repeat(2049)}),null);
  f.internals.dispose();
});

test('HTML instrumentation preserves restrictive CSP and intersects sandbox permissions', async () => {
  const policy="sandbox allow-scripts; script-src 'none'; object-src 'none'";
  const f=await parentHtmlFixture({policy});
  assert.equal(f.frame.getAttribute('sandbox'),'allow-scripts');
  assert.equal(f.nodes.find(n=>n.tag==='meta').content,policy);
  assert.equal(f.frame.getAttribute('sandbox').includes('allow-same-origin'),false);
  f.off(); assert.equal(f.frame.getAttribute('sandbox'),'allow-scripts allow-popups allow-downloads allow-modals');
  f.internals.dispose();
});

test('HTML instrumentation refuses external preview URLs and script-disabled sandboxes', async () => {
  for (const options of [{source:'http://evil.test/sidebar/html/s/w/a.html'}, {sandbox:''}, {source:'http://127.0.0.1/api/private'}]) {
    const f=await parentHtmlFixture(options);
    assert.equal(f.entry,undefined);assert.equal(f.frame.srcdoc,undefined);
    f.off();f.internals.dispose();
  }
});


test('HTML root scroll does not subtract the document scroll offset twice', () => {
  const f = frameRuntimeFixture(); f.setScrollingRoot(); f.message({type:'mode',mode:'box'});
  f.pointer('pointerdown',40,120); f.pointer('pointerup',140,170);
  const pick = f.last('pick').selection;
  f.message({type:'notes',notes:[{id:'root-box',...pick}]});
  f.setTop(20); f.target.scrollTop=80; f.callbacks.get('scroll')();
  assert.equal(f.last('geometry').items[0].rects[0].top,40);
  f.internals.dispose();
});

test('picking an HTML element consumes its click instead of activating the webpage control', () => {
  const f=frameRuntimeFixture();f.message({type:'mode',mode:'element'});
  f.pointer('pointerdown',20,120);f.pointer('pointerup',20,120);
  let prevented=false,stopped=false;
  f.callbacks.get('click')({preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});
  assert.equal(prevented,true);assert.equal(stopped,true);
  f.internals.dispose();
});

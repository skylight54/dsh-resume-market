/**
 * Resume Market — client bundle render smoke test.
 *
 * Loads lib/client.js the way the Web host does (window.__ModuleLoader__.load),
 * applies the module against a fake client ctx, then server-renders the
 * registered sidebar icon and main panel. This catches module-scope and
 * render-time errors that a slot-registration check cannot see.
 *
 * Run: node tests/render.mjs
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// Prefer the local dev render toolchain (.devrender, installed on demand with
// `npm install`); fall back to the profile's react when react-dom is absent.
let React;
let renderToString;
try {
  const localRequire = createRequire(join(root, '.devrender', 'package.json'));
  React = localRequire('react');
  renderToString = localRequire('react-dom/server').renderToString;
} catch {
  const profileRequire = createRequire('C:/Users/35521/.dsh/profiles/desktop/package.json');
  React = profileRequire('react');
  try {
    renderToString = profileRequire('react-dom/server').renderToString;
  } catch {
    console.error('render test skipped: run `npm install` inside resume-market/.devrender first (react-dom is a test-only dependency)');
    process.exit(0);
  }
}

const code = await readFile(join(root, 'lib', 'client.js'), 'utf8');

let loaded = null;
const fakeWindow = {
  __ModuleLoader__: {
    load(entry) {
      loaded = entry;
    },
  },
};
const fakeNavigator = { language: 'zh-CN' };
const fakeLocation = { hash: '' };
const fakeDocument = { createElement: () => ({}) };

const requireShim = (name) => {
  if (name === 'react' || name === 'react/jsx-runtime') return React;
  throw new Error('client bundle required unexpected module: ' + name);
};

// eslint-disable-next-line no-new-func
const run = new Function('window', 'require', 'navigator', 'location', 'document', code);
run(fakeWindow, requireShim, fakeNavigator, fakeLocation, fakeDocument);

if (!loaded) throw new Error('client bundle did not call window.__ModuleLoader__.load');
if (typeof loaded.id !== 'string' || !loaded.id.includes('resume-market')) {
  throw new Error('client bundle id mismatch: ' + loaded.id);
}
if (typeof loaded.factory !== 'function') throw new Error('client bundle factory missing');

const mod = loaded.factory(requireShim);
const registered = [];
const disposers = [];
const fakeCtx = {
  effect(fn) {
    const dispose = fn();
    if (typeof dispose === 'function') disposers.push(dispose);
  },
  locale: { register: (ns, strings) => ({ ns, strings }) },
  slots: {
    inject(_name, fn) {
      return fn();
    },
    register(definition, component) {
      registered.push({ definition, component });
      return () => {};
    },
  },
  layout: { selectPanel: () => {} },
};

mod.apply(fakeCtx);

const sidebar = registered.find((r) => r.definition.name === 'sidebar.panellist');
const main = registered.find((r) => r.definition.name === 'main');
if (!sidebar) throw new Error('sidebar.panellist registration missing');
if (!main) throw new Error('main registration missing');
if (sidebar.definition.id !== 'resume-market') throw new Error('sidebar id mismatch');
if (main.definition.key !== 'resume-market') throw new Error('main key mismatch');

const iconHtml = renderToString(React.createElement(sidebar.component, { size: 18, active: false }));
if (!iconHtml.includes('<svg')) throw new Error('sidebar icon did not render an svg');

// The panel starts in its loading state; network is not available during SSR.
const panelHtml = renderToString(React.createElement(main.component, {}));
if (!panelHtml.includes('rm-root')) throw new Error('panel root did not render: ' + panelHtml.slice(0, 120));

for (const d of disposers) {
  try {
    d();
  } catch {
    /* disposal is not part of this check */
  }
}

console.log('render ok:', {
  id: loaded.id,
  registrations: registered.map((r) => r.definition.name + ':' + (r.definition.key || r.definition.id)),
  icon: iconHtml.length + 'b',
  panel: panelHtml.length + 'b',
});

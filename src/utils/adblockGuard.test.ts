import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ADBLOCK_RS_PATH = path.resolve(process.cwd(), 'src-tauri/src/adblock.rs');
const LIB_RS_PATH = path.resolve(process.cwd(), 'src-tauri/src/lib.rs');

function extractAdblockArtifacts(): { domains: string[]; guardScript: string } {
  const source = fs.readFileSync(ADBLOCK_RS_PATH, 'utf8');

  const domainsMatch = source.match(
    /pub const AD_BLOCK_DOMAINS:\s*&\[&str\]\s*=\s*&\[([\s\S]*?)\];/,
  );
  assert.ok(domainsMatch, 'AD_BLOCK_DOMAINS block should exist in adblock.rs');

  const domains = Array.from(domainsMatch[1].matchAll(/"([^"]+)"/g)).map((m) => m[1]);
  assert.ok(domains.length >= 100, `Expected >= 100 ad domains, got ${domains.length}`);

  const scriptMatch = source.match(
    /pub fn build_player_guard_script\(\) -> String \{[\s\S]*?let template = r###"([\s\S]*?)"###;/,
  );
  assert.ok(scriptMatch, 'build_player_guard_script template should exist in adblock.rs');

  const guardScript = scriptMatch[1].replace('__DOMAINS_JSON__', JSON.stringify(domains));
  return { domains, guardScript };
}

interface MockElementInit {
  tagName: string;
  attrs?: Record<string, string>;
  textContent?: string;
  style?: Record<string, string>;
  rect?: { width: number; height: number };
  hasInteractiveChild?: boolean;
  contentWindow?: Record<string, unknown>;
}

function createGuardSandbox(guardScript: string) {
  const listeners = new Map<string, Array<(evt: any) => void>>();
  const fetchPassthroughCalls: string[] = [];
  const xhrPassthroughCalls: Array<{ method: string; url: string; headers: Array<[string, string]> }> = [];
  const appendedNodes: any[] = [];
  const anchorClickPassthrough: string[] = [];
  const formSubmitPassthrough: string[] = [];

  class FakeNode {
    appendChild(child: any) {
      appendedNodes.push(child);
      return child;
    }
    insertBefore(child: any) {
      appendedNodes.push(child);
      return child;
    }
  }

  class FakeElement extends FakeNode {
    tagName: string;
    attrs: Record<string, string>;
    textContent: string;
    computedStyle: Record<string, string>;
    rect: { width: number; height: number };
    hasInteractiveChild: boolean;
    contentWindow?: Record<string, unknown>;
    parentElement: FakeElement | null = null;
    children: FakeElement[] = [];
    removed = false;
    onerror: ((evt: any) => void) | null = null;
    dispatchedEvents: string[] = [];
    style: Record<string, any> & { setProperty: (k: string, v: string) => void };

    constructor(init: MockElementInit) {
      super();
      this.tagName = init.tagName.toUpperCase();
      this.attrs = { ...(init.attrs || {}) };
      this.textContent = init.textContent || '';
      this.computedStyle = {
        position: 'static',
        zIndex: '0',
        opacity: '1',
        backgroundColor: 'rgb(0, 0, 0)',
        ...(init.style || {}),
      };
      this.rect = init.rect || { width: 100, height: 100 };
      this.hasInteractiveChild = Boolean(init.hasInteractiveChild);
      this.contentWindow = init.contentWindow;
      const styleObj: any = {
        setProperty(k: string, v: string) {
          styleObj[k] = v;
        },
      };
      this.style = styleObj;
    }

    getAttribute(name: string) {
      return this.attrs[name] ?? null;
    }

    closest(selector: string) {
      if (selector === 'a[href]' && this.tagName === 'A' && this.attrs.href) {
        return this;
      }
      return null;
    }

    querySelector() {
      return this.hasInteractiveChild ? {} : null;
    }

    querySelectorAll() {
      return this.children;
    }

    getBoundingClientRect() {
      return this.rect;
    }

    remove() {
      this.removed = true;
    }

    dispatchEvent(evt: any) {
      this.dispatchedEvents.push(evt.type);
      if (evt.type === 'error' && typeof this.onerror === 'function') {
        this.onerror(evt);
      }
      return true;
    }
  }

  class FakeHTMLElement extends FakeElement {}

  class FakeHTMLAnchorElement extends FakeHTMLElement {
    href: string;
    target: string;
    constructor(href: string, target = '') {
      super({ tagName: 'A', attrs: { href, target } });
      this.href = href;
      this.target = target;
    }
    click() {
      anchorClickPassthrough.push(`${this.href}|${this.target}`);
    }
  }

  class FakeHTMLFormElement extends FakeHTMLElement {
    action: string;
    target: string;
    constructor(action: string, target = '') {
      super({ tagName: 'FORM', attrs: { action, target } });
      this.action = action;
      this.target = target;
    }
    submit() {
      formSubmitPassthrough.push(`${this.action}|${this.target}`);
    }
  }

  class FakeXMLHttpRequest {
    readyState = 0;
    status = 0;
    statusText = '';
    responseText = '';
    response = '';
    responseURL = '';
    onreadystatechange: ((evt: any) => void) | null = null;
    onload: ((evt: any) => void) | null = null;
    private _opened = false;
    private _record: { method: string; url: string; headers: Array<[string, string]> } | null = null;
    private _listeners = new Map<string, Array<(evt: any) => void>>();

    open(method: string, url: string) {
      this._opened = true;
      this._record = { method, url, headers: [] };
    }
    setRequestHeader(name: string, value: string) {
      if (!this._opened) {
        throw new Error('InvalidStateError: setRequestHeader called before open');
      }
      this._record?.headers.push([name, value]);
    }
    overrideMimeType(_mime: string) {
      if (!this._opened) {
        throw new Error('InvalidStateError: overrideMimeType called before open');
      }
    }
    abort() {
      // no-op
    }
    send() {
      if (this._record) {
        xhrPassthroughCalls.push(this._record);
      }
    }
    addEventListener(type: string, cb: (evt: any) => void) {
      const list = this._listeners.get(type) || [];
      list.push(cb);
      this._listeners.set(type, list);
    }
    dispatchEvent(evt: any) {
      if (evt.type === 'readystatechange' && typeof this.onreadystatechange === 'function') {
        this.onreadystatechange(evt);
      }
      if (evt.type === 'load' && typeof this.onload === 'function') {
        this.onload(evt);
      }
      for (const cb of this._listeners.get(evt.type) || []) {
        cb(evt);
      }
      return true;
    }
  }

  const head = new FakeHTMLElement({ tagName: 'HEAD' });
  const docEl = new FakeHTMLElement({ tagName: 'HTML' });
  const body = new FakeHTMLElement({ tagName: 'BODY' });
  let queryMap: Record<string, FakeElement[]> = {};
  let mutationCallback: (() => void) | null = null;
  const documentMock = {
    readyState: 'complete',
    head,
    body,
    documentElement: docEl,
    getElementById: () => null,
    createElement: (tag: string) => new FakeHTMLElement({ tagName: tag }),
    querySelectorAll: (selector: string) => queryMap[selector] || [],
    addEventListener: (type: string, cb: (evt: any) => void) => {
      const list = listeners.get(type) || [];
      list.push(cb);
      listeners.set(type, list);
    },
  };

  const windowMock: Record<string, any> = {
    location: { href: 'https://kinokino.vip/film/435/', origin: 'https://kinokino.vip' },
    innerWidth: 1366,
    innerHeight: 820,
    open: () => ({ fakePopup: true }),
    Notification: {
      requestPermission: () => Promise.resolve('granted'),
    },
    fetch: (input: any) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      fetchPassthroughCalls.push(url);
      return Promise.resolve(new Response('ok', { status: 200 }));
    },
    getComputedStyle: (el: FakeElement) => el.computedStyle,
    requestAnimationFrame: (cb: () => void) => {
      cb();
      return 1;
    },
  };
  windowMock.window = windowMock;

  const sandbox = {
    window: windowMock,
    document: documentMock,
    Node: FakeNode,
    Element: FakeElement,
    HTMLElement: FakeHTMLElement,
    HTMLAnchorElement: FakeHTMLAnchorElement,
    HTMLFormElement: FakeHTMLFormElement,
    XMLHttpRequest: FakeXMLHttpRequest,
    Response,
    URL,
    Event,
    MutationObserver: class {
      constructor(cb: () => void) {
        mutationCallback = cb;
      }
      observe() {}
    },
    setTimeout,
  };

  // Validate pure JS syntax first
  assert.doesNotThrow(() => new Function(guardScript), 'Guard script must be syntactically valid JS');
  vm.runInNewContext(guardScript, sandbox);

  return {
    windowMock,
    listeners,
    fetchPassthroughCalls,
    xhrPassthroughCalls,
    appendedNodes,
    anchorClickPassthrough,
    formSubmitPassthrough,
    FakeHTMLElement,
    FakeHTMLAnchorElement,
    FakeHTMLFormElement,
    FakeXMLHttpRequest,
    docEl,
    setQueryMap(map: Record<string, FakeElement[]>) {
      queryMap = map;
    },
    triggerSweep() {
      if (mutationCallback) mutationCallback();
    },
  };
}

test('AD_BLOCK_DOMAINS contains valid lowercase hostnames and excludes video/catalog domains', () => {
  const { domains } = extractAdblockArtifacts();
  const seen = new Set<string>();
  for (const domain of domains) {
    assert.match(domain, /^[a-z0-9.-]+\.[a-z]{2,}$/, `Invalid domain entry: ${domain}`);
    assert.ok(!seen.has(domain), `Duplicate domain entry: ${domain}`);
    seen.add(domain);
  }
  assert.ok(!seen.has('kinokino.vip'));
  assert.ok(!seen.has('themoviedb.org'));
  assert.ok(!seen.has('api.themoviedb.org'));
  assert.ok(!seen.has('kinopoiskapiunofficial.tech'));
});

test('guard script blocks popups, notifications, external _blank/named-target links and forms', async () => {
  const { guardScript } = extractAdblockArtifacts();
  const env = createGuardSandbox(guardScript);

  assert.equal(env.windowMock.open('https://casino-promo.example'), null);
  assert.equal(await env.windowMock.Notification.requestPermission(), 'denied');

  // External _blank anchor click is blocked
  const externalBlank = new env.FakeHTMLAnchorElement('https://promo-popup.xyz/go', '_blank');
  externalBlank.click();
  // External named window target is also blocked
  const externalNamed = new env.FakeHTMLAnchorElement('https://promo-popup.xyz/go', 'popup_win_1');
  externalNamed.click();
  // Ad domain even without _blank is blocked
  const adLink = new env.FakeHTMLAnchorElement('https://go.popads.net/click', '_self');
  adLink.click();
  // Same-origin navigation link is allowed
  const sameOriginLink = new env.FakeHTMLAnchorElement('https://kinokino.vip/film/500/', '_self');
  sameOriginLink.click();

  assert.deepEqual(env.anchorClickPassthrough, ['https://kinokino.vip/film/500/|_self']);

  // External _blank form is blocked, same-origin form is allowed
  const badForm = new env.FakeHTMLFormElement('https://casino-promo.xyz/open', '_blank');
  badForm.submit();
  const okForm = new env.FakeHTMLFormElement('https://kinokino.vip/search', '_self');
  okForm.submit();

  assert.deepEqual(env.formSubmitPassthrough, ['https://kinokino.vip/search|_self']);
});

test('guard script intercepts VAST and ad fetch/XHR cleanly without blocking media streams', async () => {
  const { guardScript } = extractAdblockArtifacts();
  const env = createGuardSandbox(guardScript);

  const vastResp = await env.windowMock.fetch('https://pubads.g.doubleclick.net/gampad/ads?vast=1');
  assert.equal(vastResp.status, 200);
  const vastBody = await vastResp.text();
  assert.ok(vastBody.includes('<VAST version="3.0"></VAST>'));

  const adResp = await env.windowMock.fetch('https://cdn.popads.net/pop.js');
  assert.equal(adResp.status, 204);

  const streamUrl = 'https://cdn.example-video.net/film/master.m3u8?token=abc';
  const movieUrl = 'https://kinokino.vip/film/435/';
  await env.windowMock.fetch(streamUrl);
  await env.windowMock.fetch(movieUrl);
  assert.deepEqual(env.fetchPassthroughCalls, [streamUrl, movieUrl]);

  // Blocked VAST XHR with setRequestHeader + overrideMimeType must NOT throw InvalidStateError
  const blockedXhr = new env.FakeXMLHttpRequest();
  let loadCalls = 0;
  let readyStateCalls = 0;
  blockedXhr.onreadystatechange = () => {
    readyStateCalls += 1;
  };
  blockedXhr.onload = () => {
    loadCalls += 1;
  };

  assert.doesNotThrow(() => {
    blockedXhr.open('GET', 'https://vast.videoroll.net/vast.xml?id=42');
    blockedXhr.setRequestHeader('Accept', 'application/xml');
    blockedXhr.overrideMimeType('text/xml');
    blockedXhr.send();
  });

  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(blockedXhr.status, 200);
  assert.equal(blockedXhr.readyState, 4);
  assert.ok(blockedXhr.responseText.includes('<VAST version="3.0"></VAST>'));
  assert.equal(loadCalls, 1, 'onload should fire exactly once');
  assert.equal(readyStateCalls, 1, 'onreadystatechange should fire exactly once');

  // Legitimate media stream XHR passes through untouched
  const streamXhr = new env.FakeXMLHttpRequest();
  streamXhr.open('GET', 'https://cdn.example-video.net/seg-001.ts');
  streamXhr.setRequestHeader('Range', 'bytes=0-1024');
  streamXhr.send();
  assert.equal(env.xhrPassthroughCalls.length, 1);
  assert.equal(env.xhrPassthroughCalls[0].url, 'https://cdn.example-video.net/seg-001.ts');
});

test('guard script blocks ad scripts/iframes, hardens same-origin iframes, and removes click-hijack overlays', () => {
  const { guardScript } = extractAdblockArtifacts();
  const env = createGuardSandbox(guardScript);

  const adScript = new env.FakeHTMLElement({
    tagName: 'SCRIPT',
    attrs: { src: 'https://an.yandex.ru/system/context.js' },
  });
  const adIframe = new env.FakeHTMLElement({
    tagName: 'IFRAME',
    attrs: { src: 'https://cdn.popads.net/frame.html' },
  });
  const playerIframeWin: Record<string, any> = {
    open: () => ({ leakedPopup: true }),
  };
  const playerIframe = new env.FakeHTMLElement({
    tagName: 'IFRAME',
    attrs: { src: 'https://balancer.example/embed/435' },
    contentWindow: playerIframeWin,
  });

  const beforeLen = env.appendedNodes.length;
  env.docEl.appendChild(adScript);
  env.docEl.appendChild(adIframe);
  env.docEl.appendChild(playerIframe);

  const newlyAppended = env.appendedNodes.slice(beforeLen);
  assert.deepEqual(newlyAppended, [playerIframe]);
  assert.equal(playerIframeWin.open('https://popup.example'), null);

  // Transparent full-screen high-z-index click-hijack overlay is blocked and removed
  const clickListeners = env.listeners.get('click') || [];
  assert.ok(clickListeners.length > 0);

  const hijackOverlay = new env.FakeHTMLElement({
    tagName: 'DIV',
    style: {
      position: 'fixed',
      zIndex: '2147483647',
      opacity: '0',
      backgroundColor: 'transparent',
    },
    rect: { width: 1366, height: 820 },
  });

  let prevented = false;
  let stopped = false;
  clickListeners[0]({
    target: hijackOverlay,
    preventDefault: () => {
      prevented = true;
    },
    stopImmediatePropagation: () => {
      stopped = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(hijackOverlay.removed, true);

  // Normal video element click is NOT blocked or removed
  const videoEl = new env.FakeHTMLElement({
    tagName: 'VIDEO',
    style: { position: 'fixed', zIndex: '99999', opacity: '0' },
    rect: { width: 1366, height: 820 },
  });
  let videoPrevented = false;
  clickListeners[0]({
    target: videoEl,
    preventDefault: () => {
      videoPrevented = true;
    },
    stopImmediatePropagation: () => {},
  });
  assert.equal(videoPrevented, false);
  assert.equal(videoEl.removed, false);
});

test('blocked ad <script> fires async error event so video player never hangs on spinner', async () => {
  const { guardScript } = extractAdblockArtifacts();
  const env = createGuardSandbox(guardScript);

  const imaScript = new env.FakeHTMLElement({
    tagName: 'SCRIPT',
    attrs: { src: 'https://imasdk.googleapis.com/js/sdkloader/ima3.js' },
  });
  let onerrorCalled = 0;
  imaScript.onerror = () => {
    onerrorCalled += 1;
  };

  env.docEl.appendChild(imaScript);
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(onerrorCalled, 1, 'Blocked ad script must invoke onerror so player skips ad init');
  assert.deepEqual(imaScript.dispatchedEvents, ['error']);
});

test('guard script hides floating Telegram widget (УБЕЖИЩЕ) while preserving 1-4 server switcher', () => {
  const { guardScript } = extractAdblockArtifacts();
  const env = createGuardSandbox(guardScript);

  // Simulate floating Telegram widget in bottom-left corner
  const tgWrapper = new env.FakeHTMLElement({
    tagName: 'DIV',
    textContent: 'УБЕЖИЩЕ X',
    style: { position: 'fixed', zIndex: '9999' },
    rect: { width: 120, height: 110 },
  });
  const tgLink = new env.FakeHTMLElement({
    tagName: 'A',
    attrs: { href: 'https://t.me/ubezhische_channel' },
    textContent: 'УБЕЖИЩЕ',
    rect: { width: 80, height: 80 },
  });
  tgLink.parentElement = tgWrapper;
  tgWrapper.children = [tgLink];

  // Simulate right-edge server switcher 1: / 2: / 3: / 4:
  const switcherContainer = new env.FakeHTMLElement({
    tagName: 'DIV',
    style: { position: 'fixed', zIndex: '500' },
    rect: { width: 48, height: 140 },
  });
  const tab1 = new env.FakeHTMLElement({ tagName: 'DIV', textContent: '1 :' });
  const tab2 = new env.FakeHTMLElement({ tagName: 'DIV', textContent: '2 :' });
  const tab3 = new env.FakeHTMLElement({ tagName: 'DIV', textContent: '3 :' });
  const tab4 = new env.FakeHTMLElement({ tagName: 'DIV', textContent: '4 :' });
  switcherContainer.children = [tab1, tab2, tab3, tab4];

  // Even if a link accidentally lived near the switcher, the switcher container must never be hidden
  const tgInsideSwitcher = new env.FakeHTMLElement({
    tagName: 'A',
    attrs: { href: 'https://t.me/promo' },
  });
  tgInsideSwitcher.parentElement = switcherContainer;

  const selector =
    'a[href*="t.me/"], a[href*="telegram.me/"], a[href*="telegram.dog/"], a[href^="tg://"]';
  env.setQueryMap({
    [selector]: [tgLink, tgInsideSwitcher],
  });
  env.triggerSweep();

  assert.equal(tgWrapper.style.display, 'none', 'Floating Telegram widget wrapper must be hidden');
  assert.notEqual(
    switcherContainer.style.display,
    'none',
    'Server switcher 1-4 container must NEVER be hidden',
  );
  assert.equal(
    tgInsideSwitcher.style.display,
    'none',
    'Only the Telegram link itself should be hidden if inside a protected container',
  );
});

test('Chromium launcher uses zero unsupported command-line flags and Firefox enables SmartBlock shims', () => {
  const libRs = fs.readFileSync(LIB_RS_PATH, 'utf8');
  const adblockRs = fs.readFileSync(ADBLOCK_RS_PATH, 'utf8');

  assert.ok(
    !libRs.includes('--host-resolver-rules'),
    'lib.rs must NOT pass --host-resolver-rules (causes Chrome warning banner & stuck Ad spinner)',
  );
  assert.ok(
    !libRs.includes('--load-extension'),
    'lib.rs must NOT pass --load-extension (ignored in Chrome 137+ / triggers warnings)',
  );
  assert.ok(
    !libRs.includes('--remote-debugging-port'),
    'lib.rs must NOT pass --remote-debugging-port (triggers Chromium bad flags prompt)',
  );
  assert.ok(
    libRs.includes('extensions.webcompat.enable_shims'),
    'Firefox player profile should enable SmartBlock webcompat shims',
  );
  assert.ok(
    adblockRs.includes('detect_chromium_profile_with_adblocker'),
    'adblock.rs should include read-only Chromium AdBlock profile detection',
  );
  assert.ok(
    adblockRs.includes('remove_dir_all(profile_dir.join("cinescope-adblock-ext"))'),
    'prepare_chromium_clean_preferences should clean up legacy cinescope-adblock-ext directory',
  );
  assert.ok(
    adblockRs.includes('a[href*="t.me/"]'),
    'FIREFOX_USER_CONTENT_CSS and COSMETIC_CSS should hide Telegram floating widgets',
  );
});


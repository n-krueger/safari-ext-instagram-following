const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const source = fs.readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");
const stylesheet = fs.readFileSync(path.join(__dirname, "..", "extension", "content.css"), "utf8");
const HIDDEN = "data-instagram-following-hidden";

function browser(t, path = "/?variant=following", html = "", beforeStart = () => {}) {
  const dom = new JSDOM(html, {
    url: new URL(path, "https://www.instagram.com/").href,
    pretendToBeVisual: true
  });
  const realWindow = dom.window;
  beforeStart(realWindow);
  const observers = [];
  class TrackedMutationObserver extends realWindow.MutationObserver {
    constructor(callback) {
      super(callback);
      observers.push(this);
    }
  }
  t.after(() => {
    // jsdom removes DOM nodes on close, unlike real document teardown. Stop observers first.
    observers.forEach((observer) => observer.disconnect());
    realWindow.close();
  });
  const navigations = [];
  const frames = [];
  const intervals = [];
  // Keep a real DOM, MutationObserver and History implementation. Stub only navigation
  // (jsdom cannot load a new document) and timers so tests need not wait 500 ms.
  const window = {
    location: {
      get href() { return realWindow.location.href; },
      replace: (url) => navigations.push({ method: "replace", url }),
      assign: (url) => navigations.push({ method: "assign", url })
    },
    addEventListener: realWindow.addEventListener.bind(realWindow),
    setInterval: (callback, delay) => intervals.push({ callback, delay })
  };
  vm.runInNewContext(source, {
    window,
    document: realWindow.document,
    URL,
    Node: realWindow.Node,
    MutationObserver: TrackedMutationObserver,
    requestAnimationFrame: (callback) => frames.push(callback)
  }, { filename: "content.js" });

  return {
    window: realWindow,
    document: realWindow.document,
    navigations,
    navigate: (path) => realWindow.history.pushState({}, "", path),
    tick: () => intervals.forEach(({ callback }) => callback()),
    async flush() {
      // Flush both DOM mutations and the batched link updates they schedule.
      for (let i = 0; i < 3; i++) {
        await Promise.resolve();
        frames.splice(0).forEach((callback) => callback());
      }
    },
    click(selector, options = {}) {
      const event = new realWindow.MouseEvent("click", {
        bubbles: true, cancelable: true, button: 0, ...options
      });
      // Suppress jsdom's unimplemented default navigation after the extension runs.
      const suppressDefault = (event) => event.preventDefault();
      realWindow.document.addEventListener("click", suppressDefault, { once: true });
      realWindow.document.querySelector(selector).dispatchEvent(event);
      realWindow.document.removeEventListener("click", suppressDefault);
      return event;
    }
  };
}

for (const path of ["/", "/?variant=home", "/?variant=favorites", "/?variant=", "/?variant=Following"]) {
  test(`redirects the main feed: ${path}`, (t) => {
    const b = browser(t, path);
    assert.deepEqual(b.navigations, [{
      method: "replace", url: "https://www.instagram.com/?variant=following"
    }]);
  });
}

test("keeps unrelated query parameters and fragments", (t) => {
  const b = browser(t, "/?utm_source=bookmark&variant=home#latest");
  assert.equal(b.navigations[0].url,
    "https://www.instagram.com/?utm_source=bookmark&variant=following#latest");
});

test("canonicalizes duplicate variant parameters", (t) => {
  const b = browser(t, "/?variant=following&variant=home&foo=bar");
  const target = new URL(b.navigations[0].url);
  assert.deepEqual(target.searchParams.getAll("variant"), ["following"]);
  assert.equal(target.searchParams.get("foo"), "bar");
});

for (const path of [
  "/?variant=following", "/?x=1&variant=following#posts", "/someone/",
  "/p/abc/", "/reels/", "/explore/", "/direct/inbox/", "/accounts/login/?next=/",
  "/api/v1/feed/timeline/", "https://example.com/?variant=home",
  "https://www.instagram.com.evil.example/?variant=home", "http://www.instagram.com/"
]) {
  test(`does not redirect: ${path}`, (t) => {
    const b = browser(t, path);
    b.tick();
    assert.deepEqual(b.navigations, []);
  });
}

test("supports the bare instagram.com hostname", (t) => {
  const b = browser(t, "https://instagram.com/?variant=home");
  assert.equal(b.navigations[0].url, "https://instagram.com/?variant=following");
});

test("catches URL-only SPA transitions without patching history", (t) => {
  const b = browser(t, "/someone/");
  const pushState = b.window.history.pushState;
  b.navigate("/?variant=home");
  b.tick();
  b.tick();
  assert.equal(b.navigations.length, 1, "do not repeatedly redirect while navigation is pending");
  assert.equal(b.navigations[0].method, "replace");
  assert.equal(b.window.history.pushState, pushState);
});

test("catches a SPA transition as soon as Instagram updates the DOM", async (t) => {
  const b = browser(t, "/someone/");
  b.navigate("/");
  b.document.body.appendChild(b.document.createElement("main"));
  await b.flush();
  assert.equal(b.navigations.length, 1);
});

for (const event of ["popstate", "pageshow", "hashchange"]) {
  test(`checks the feed on ${event}`, (t) => {
    const b = browser(t, "/someone/");
    b.navigate("/?variant=home");
    b.window.dispatchEvent(new b.window.Event(event));
    assert.equal(b.navigations.length, 1);
  });
}

test("skips the background timer and checks immediately when visible again", (t) => {
  const b = browser(t, "/someone/");
  let hidden = true;
  Object.defineProperty(b.document, "hidden", { get: () => hidden });
  b.navigate("/");
  b.tick();
  assert.equal(b.navigations.length, 0);
  hidden = false;
  b.document.dispatchEvent(new b.window.Event("visibilitychange"));
  assert.equal(b.navigations.length, 1);
});

test("hides For you links without depending on English labels or Instagram class names", (t) => {
  const b = browser(t, "/?variant=following", `
    <a id="for-you" href="/?foo=1&variant=home" role="tab">Für dich</a>
    <a id="default-tab" href="/" role="tab">For you</a>
    <a id="following" href="/?variant=following" role="tab">Gefolgt</a>
    <a id="home" href="/" role="link">Home</a>
    <a id="profile" href="/someone/">Profile</a>
  `);
  assert.equal(b.document.querySelector("#for-you").hasAttribute(HIDDEN), true);
  assert.equal(b.document.querySelector("#default-tab").hasAttribute(HIDDEN), true);
  for (const id of ["following", "home", "profile"]) {
    assert.equal(b.document.querySelector(`#${id}`).hasAttribute(HIDDEN), false);
  }
  assert.equal(b.document.querySelector("#home").href, "https://www.instagram.com/?variant=following");
  assert.equal(b.document.querySelector("#profile").getAttribute("href"), "/someone/");
});

test("processes dynamically inserted links and reused link elements", async (t) => {
  const b = browser(t);
  b.document.body.innerHTML = '<div><a id="link" href="/">Home</a></div>';
  await b.flush();
  const link = b.document.querySelector("#link");
  assert.equal(new URL(link.href).searchParams.get("variant"), "following");
  link.setAttribute("href", "/?variant=home");
  await b.flush();
  assert.equal(link.hasAttribute(HIDDEN), true);
  link.setAttribute("href", "/someone/");
  await b.flush();
  assert.equal(link.hasAttribute(HIDDEN), false);
  assert.equal(link.getAttribute("href"), "/someone/");
});

test("intercepts nested Home taps before the SPA router and loads the real feed", (t) => {
  const b = browser(t, "/someone/", '<a href="/" id="home"><span id="icon">Home</span></a>');
  let routerCalled = false;
  b.document.addEventListener("click", () => { routerCalled = true; });
  b.click("#icon");
  assert.equal(routerCalled, false);
  assert.deepEqual(b.navigations, [{
    method: "assign", url: "https://www.instagram.com/?variant=following"
  }]);
});

test("intercepts a Home link inserted just before a tap, before MutationObserver runs", (t) => {
  const b = browser(t, "/someone/");
  b.document.body.innerHTML = '<a id="home" href="/">Home</a>';
  b.click("#home");
  assert.equal(b.navigations[0].url, "https://www.instagram.com/?variant=following");
});

for (const options of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
  test(`preserves modified clicks: ${JSON.stringify(options)}`, (t) => {
    const b = browser(t, "/someone/", '<a href="/" id="home">Home</a>');
    b.click("#home", options);
    assert.equal(b.navigations.length, 0);
    assert.equal(b.document.querySelector("#home").href, "https://www.instagram.com/?variant=following");
  });
}

test("preserves target=_blank, external links, downloads and post clicks", (t) => {
  const b = browser(t, "/someone/", `
    <a id="new-tab" href="/" target="_blank">Home</a>
    <a id="external" href="https://example.com/">External</a>
    <a id="download" href="/" download>Download</a>
    <a id="post" href="/p/abc/">Post</a>
  `);
  for (const id of ["new-tab", "external", "download", "post"]) b.click(`#${id}`);
  assert.equal(b.navigations.length, 0);
  assert.equal(b.document.querySelector("#new-tab").href, "https://www.instagram.com/?variant=following");
  assert.equal(b.document.querySelector("#download").getAttribute("href"), "/");
});

test("starts before a body element exists", (t) => {
  const b = browser(t, "/", "", (window) => window.document.documentElement.remove());
  assert.equal(b.document.body, null);
  assert.equal(b.navigations.length, 1);
});

function withStyles(window) {
  const style = window.document.createElement("style");
  style.textContent = stylesheet;
  window.document.head.appendChild(style);
}

const mobileHeading = fs.readFileSync(path.join(__dirname, "fixtures", "mobile-following-heading.html"), "utf8");

function arrow(b) {
  return b.document.querySelector("svg").parentElement;
}

function arrowDisplay(b) {
  const element = arrow(b);
  // jsdom incorrectly lets inline display:inline-block beat stylesheet !important.
  // Assert matching important declarations without altering the real captured HTML.
  // scripts/test-mobile-layout.swift checks the actual cascade in native WebKit.
  for (const sheet of b.document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (rule.selectorText && element.matches(rule.selectorText) &&
          rule.style.getPropertyValue("display") === "none" &&
          rule.style.getPropertyPriority("display") === "important") return "none";
    }
  }
  return b.window.getComputedStyle(element).display;
}

function assertTitleVisible(b) {
  const title = b.document.querySelector('span[dir="auto"]');
  assert.equal(title.textContent, "Gefolgt");
  // Checking only the title itself would miss a hidden ancestor (the previous bug).
  for (let element = title; element; element = element.parentElement) {
    assert.notEqual(b.window.getComputedStyle(element).display, "none", element.outerHTML);
  }
}

test("actual iPhone markup: hides only the arrow wrapper, preserving the shared link and title", (t) => {
  const b = browser(t, "/?variant=following", mobileHeading, withStyles);
  assert.equal(arrowDisplay(b), "none");
  assertTitleVisible(b);
  assert.equal(b.document.querySelector("a").href, "https://www.instagram.com/?variant=following");
});

for (const path of ["/someone/", "/p/abc/", "/direct/inbox/"]) {
  test(`keeps header Back controls on other routes: ${path}`, (t) => {
    const b = browser(t, path, mobileHeading, withStyles);
    assert.notEqual(arrowDisplay(b), "none");
    assertTitleVisible(b);
  });
}

test("restores a reused Back control after leaving Following, even without DOM changes", (t) => {
  const b = browser(t, "/?variant=following", mobileHeading, withStyles);
  assert.equal(arrowDisplay(b), "none");
  b.navigate("/someone/");
  b.tick();
  assert.notEqual(arrowDisplay(b), "none");
  b.navigate("/?variant=following");
  b.tick();
  assert.equal(arrowDisplay(b), "none");
});

test("hides a dynamically inserted mobile heading without requiring a semantic header", async (t) => {
  const b = browser(t, "/?variant=following", "", withStyles);
  b.document.body.innerHTML = mobileHeading;
  await b.flush();
  assert.equal(arrowDisplay(b), "none");
  assertTitleVisible(b);
});

test("does not hide the shared title link even in an English semantic header", (t) => {
  const html = `<header>${mobileHeading.replaceAll("Zurück", "Back")}</header>`;
  const b = browser(t, "/?variant=following", html, withStyles);
  assert.equal(arrowDisplay(b), "none");
  assertTitleVisible(b);
});

test("does not depend on generated classes or translated accessible labels", (t) => {
  const b = browser(t, "/?variant=following", mobileHeading, (window) => {
    withStyles(window);
    window.document.querySelectorAll("[class]").forEach((element) => element.removeAttribute("class"));
    window.document.querySelector("svg").setAttribute("aria-label", "Retour");
    window.document.querySelector("title").textContent = "Retour";
  });
  assert.equal(arrowDisplay(b), "none");
  assertTitleVisible(b);
});

for (const attributes of ['role="dialog"', 'aria-modal="true"']) {
  test(`preserves the same arrow inside a modal: ${attributes}`, (t) => {
    const b = browser(t, "/?variant=following", `<div ${attributes}>${mobileHeading}</div>`, withStyles);
    assert.notEqual(arrowDisplay(b), "none");
    assertTitleVisible(b);
  });
}

test("preserves arrows in unrelated links and restores them when a feed link is reused", async (t) => {
  const b = browser(t, "/?variant=following", mobileHeading, withStyles);
  const link = b.document.querySelector("a");
  assert.equal(arrowDisplay(b), "none");
  link.setAttribute("href", "/someone/");
  await b.flush();
  assert.notEqual(arrowDisplay(b), "none");
  link.setAttribute("href", "/");
  await b.flush();
  assert.equal(arrowDisplay(b), "none");
});

test("does not hide other icons or the normal Home navigation", (t) => {
  const b = browser(t, "/?variant=following", `
    ${mobileHeading}
    <a id="home" href="/" aria-label="Home"><svg><path d="M1 1" /></svg>Home</a>
    <button id="other" aria-label="Back">←</button>
  `, withStyles);
  b.document.querySelector("a svg path").setAttribute("d", "M1 1");
  assert.notEqual(arrowDisplay(b), "none");
  for (const id of ["home", "other"]) {
    assert.notEqual(b.window.getComputedStyle(b.document.querySelector(`#${id}`)).display, "none");
  }
  assertTitleVisible(b);
});

test("the visible Following title still opens Following, never the home feed", (t) => {
  const b = browser(t, "/?variant=following", mobileHeading, withStyles);
  b.click('span[dir="auto"]');
  assert.deepEqual(b.navigations, [{
    method: "assign", url: "https://www.instagram.com/?variant=following"
  }]);
});

test("CSS hides an arrow added later to an already processed feed link", async (t) => {
  const b = browser(t, "/?variant=following", '<a href="/"></a>', withStyles);
  const template = b.document.createElement("template");
  template.innerHTML = mobileHeading;
  b.document.querySelector("a").innerHTML = template.content.querySelector("a").innerHTML;
  await b.flush();
  assert.equal(arrowDisplay(b), "none");
  assertTitleVisible(b);
});

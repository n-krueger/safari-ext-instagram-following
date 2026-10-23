(() => {
  "use strict";

  const HIDDEN_ATTRIBUTE = "data-instagram-following-hidden";
  const FEED_ATTRIBUTE = "data-instagram-following-feed";
  const FEED_LINK_ATTRIBUTE = "data-instagram-following-feed-link";
  const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);
  let redirectingTo = null;

  function feedURL(href) {
    try {
      const url = new URL(href, window.location.href);
      return url.protocol === "https:" && INSTAGRAM_HOSTS.has(url.hostname) &&
        url.port === "" && url.pathname === "/" ? url : null;
    } catch {
      return null;
    }
  }

  function followingURL(url) {
    const target = new URL(url.href);
    // set also removes duplicate variant parameters, without dropping other params or #hash.
    target.searchParams.set("variant", "following");
    return target;
  }

  function enforceFeed() {
    const url = feedURL(window.location.href);
    const variants = url?.searchParams.getAll("variant") ?? [];
    const isFollowing = Boolean(url && variants.length === 1 && variants[0] === "following");
    // Scope header styling to this route, including URL-only SPA transitions. CSS
    // handles inserted/reused controls and restores them when leaving the feed.
    document.documentElement?.toggleAttribute(FEED_ATTRIBUTE, isFollowing);
    if (!url) {
      redirectingTo = null;
      return false;
    }

    if (isFollowing) {
      redirectingTo = null;
      return false;
    }

    const target = followingURL(url).href;
    if (redirectingTo !== target) {
      redirectingTo = target;
      // A real navigation is essential: replaceState alone doesn't change Instagram's feed.
      // Replace avoids leaving the unwanted feed in the Back history.
      window.location.replace(target);
    }
    return true;
  }

  function updateLink(link) {
    const url = feedURL(link.getAttribute("href"));
    // The mobile Following title and arrow share one root-feed link. Mark its URL
    // semantics so CSS can hide only the arrow, regardless of language or classes.
    link.toggleAttribute(FEED_LINK_ATTRIBUTE, Boolean(url && !link.hasAttribute("download")));
    const variant = url?.searchParams.get("variant");
    const unwantedTab = url && (variant === "home" ||
      (link.getAttribute("role") === "tab" && variant !== "following"));

    if (unwantedTab) {
      if (!link.hasAttribute(HIDDEN_ATTRIBUTE)) {
        link.setAttribute(HIDDEN_ATTRIBUTE, "");
      }
      return;
    }

    link.removeAttribute(HIDDEN_ATTRIBUTE);
    if (!url || link.hasAttribute("download")) return;

    // Rewriting also covers long-press/Open in New Tab on iOS and modifier clicks on macOS.
    const target = followingURL(url).href;
    if (link.href !== target) link.setAttribute("href", target);
  }

  function updateLinks(root) {
    if (root.nodeType === Node.ELEMENT_NODE && root.matches("a[href]")) updateLink(root);
    root.querySelectorAll?.("a[href]").forEach(updateLink);
  }

  // The content script lives in Safari's isolated world. Do not patch the page's history
  // object or inject page scripts (which can be blocked by Instagram's CSP).
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
        event.shiftKey || event.altKey) return;

    const link = event.target.closest?.("a[href]");
    if (!link || link.hasAttribute("download")) return;
    const url = feedURL(link.href);
    if (!url) return;

    const target = followingURL(url).href;
    if (link.href !== target) link.setAttribute("href", target);
    if (link.target && link.target.toLowerCase() !== "_self") return;

    // Beat Instagram's SPA router; a changed URL must load the actual Following feed.
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign(target);
  }, true);

  const pendingRoots = new Set();
  let scheduled = false;
  const observer = new MutationObserver((mutations) => {
    if (enforceFeed()) return;
    for (const mutation of mutations) {
      if (mutation.type === "attributes") pendingRoots.add(mutation.target);
      else for (const node of mutation.addedNodes) pendingRoots.add(node);
    }
    if (!scheduled && pendingRoots.size > 0) {
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        for (const root of pendingRoots) {
          if (root.isConnected) updateLinks(root);
        }
        pendingRoots.clear();
      });
    }
  });

  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["href", "role"]
  });

  window.addEventListener("popstate", enforceFeed);
  window.addEventListener("pageshow", enforceFeed);
  window.addEventListener("hashchange", enforceFeed);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) enforceFeed();
  });

  // pushState/replaceState emit no event. Catch even URL-only SPA transitions; do no
  // DOM scans here, and skip background tabs to minimize work on iOS.
  window.setInterval(() => {
    if (!document.hidden) enforceFeed();
  }, 500);

  if (!enforceFeed()) updateLinks(document);
})();

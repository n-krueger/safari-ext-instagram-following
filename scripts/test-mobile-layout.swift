// Local, offline WebKit smoke test of the actual iPhone heading HTML.
// Run from the repository root with a full Xcode selected:
// DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swift scripts/test-mobile-layout.swift
import AppKit
import WebKit

@MainActor
final class PageLoader: NSObject, WKNavigationDelegate {
    var continuation: CheckedContinuation<Void, Error>?

    func load(_ html: String, in webView: WKWebView) async throws {
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            webView.loadHTMLString(html, baseURL: URL(string: "https://www.instagram.com/?variant=following")!)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        continuation?.resume()
        continuation = nil
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        continuation?.resume(throwing: error)
        continuation = nil
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        continuation?.resume(throwing: error)
        continuation = nil
    }
}

func require(_ condition: Bool, _ message: String) throws {
    if !condition {
        throw NSError(domain: "MobileLayoutTest", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}

Task { @MainActor in
    do {
        NSApplication.shared.setActivationPolicy(.prohibited)
        let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        let fixture = try String(contentsOf: root.appendingPathComponent("test/fixtures/mobile-following-heading.html"), encoding: .utf8)
        let css = try String(contentsOf: root.appendingPathComponent("extension/content.css"), encoding: .utf8)
        let script = try String(contentsOf: root.appendingPathComponent("extension/content.js"), encoding: .utf8)
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 390, height: 844), configuration: configuration)
        let loader = PageLoader()
        webView.navigationDelegate = loader

        // Check both the real German markup (no semantic header) and an English
        // header variant that would have caused the old rule to hide the title too.
        let variants = [fixture, "<header>\(fixture.replacingOccurrences(of: "Zurück", with: "Back"))</header>"]
        for (index, markup) in variants.enumerated() {
            try await loader.load("<!doctype html><html><head><style>\(css)</style></head><body>\(markup)</body></html>", in: webView)
            // This smoke test validates the real CSS cascade against the captured
            // DOM, not extension injection timing. Evaluate the unmodified script
            // after loading so its initial scan works in an offscreen WKWebView,
            // where WebKit suspends requestAnimationFrame callbacks.
            _ = try await webView.evaluateJavaScript(script, contentWorld: .page)
            let result = try await webView.callAsyncJavaScript("""
                const arrow = document.querySelector('svg').parentElement;
                const title = document.querySelector('span[dir="auto"]');
                let titleVisible = true;
                for (let e = title; e; e = e.parentElement) {
                    if (getComputedStyle(e).display === 'none') titleVisible = false;
                }
                const hidden = getComputedStyle(arrow).display === 'none';
                const target = document.querySelector('a').href;
                const initialURL = location.href;
                const routeMarked = document.documentElement.hasAttribute('data-instagram-following-feed');
                const linkMarked = document.querySelector('a').hasAttribute('data-instagram-following-feed-link');
                history.pushState({}, '', '/someone/');
                dispatchEvent(new PopStateEvent('popstate'));
                const restored = getComputedStyle(arrow).display !== 'none';
                history.pushState({}, '', '/?variant=following');
                dispatchEvent(new PopStateEvent('popstate'));
                document.body.setAttribute('role', 'dialog');
                const dialogVisible = getComputedStyle(arrow).display !== 'none';
                return {hidden, titleVisible, target, restored, dialogVisible, initialURL, routeMarked, linkMarked};
                """, arguments: [:], in: nil, contentWorld: .page) as? [String: Any]
            try require(result?["hidden"] as? Bool == true, "Arrow was not hidden: \(String(describing: result))")
            try require(result?["titleVisible"] as? Bool == true, "Following title was hidden")
            try require(result?["target"] as? String == "https://www.instagram.com/?variant=following", "Title link was not rewritten to Following")
            try require(result?["restored"] as? Bool == true, "Arrow was not restored on a profile route")
            try require(result?["dialogVisible"] as? Bool == true, "Arrow was incorrectly hidden inside a dialog")
            print("PASS: native WebKit mobile heading variant \(index + 1): arrow hidden, title visible, link safe, route/dialog scope correct")
        }
        exit(0)
    } catch {
        FileHandle.standardError.write(Data("FAIL: \(error)\n".utf8))
        exit(1)
    }
}

Task {
    try await Task.sleep(nanoseconds: 30_000_000_000)
    FileHandle.standardError.write(Data("FAIL: WebKit layout test timed out\n".utf8))
    exit(1)
}
RunLoop.main.run()

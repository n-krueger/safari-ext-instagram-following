# Instagram Following for Safari

A small Safari Web Extension for **iPhone, iPad, and Mac** that keeps Instagram’s main feed on **Following**, instead of **For you**. Designed to complement #blockit, not replace it.

- Opening `https://www.instagram.com/` or `/?variant=home` redirects to `/?variant=following`.
- Home links open the actual Following feed, including when navigating inside Instagram.
- Identifiable For you feed links/tabs are hidden, without matching English labels or Instagram’s generated CSS class names.
- The mobile Following title’s back-to-home arrow is hidden, while the title itself stays visible. This matches the SVG shape captured from the actual iPhone markup, not localized “Back” labels or generated CSS classes. Back controls on other pages and in dialogs are left alone.
- Profiles, posts, messages, login, Reels, and Explore URLs are not redirected. Keep #blockit enabled to block the latter pages.
- No background worker, tracking, analytics, remote code, settings, or runtime dependencies. Website access is limited to `instagram.com` and `www.instagram.com`.

This changes **instagram.com in Safari**, not the Instagram app. You must be logged in for Instagram’s Following feed. It selects Instagram’s own Following feed; it does not independently filter posts or remove ads.

## Install on iPhone / iPad

Safari requires web extensions to be packaged in a signed app. A folder of JavaScript cannot be installed directly on an iPhone. The native app and extension targets are included here.

1. On your Mac, open **`safari/Instagram Following/Instagram Following.xcodeproj`** in Xcode.
2. Select the **Instagram Following (iOS)** scheme and your connected iPhone/iPad as the destination. The included app targets iOS/iPadOS **17 or later**.
3. In **Signing & Capabilities**, select your development team for **both** the iOS app and iOS extension targets. If necessary, change their bundle identifiers to unique identifiers, for example:
   - App: `com.yourname.InstagramFollowing`
   - Extension: `com.yourname.InstagramFollowing.Extension`
   Keep the extension identifier equal to the app identifier plus `.Extension`; the app uses this convention for its macOS settings button too.
4. Enable Developer Mode on the device if Xcode requests it, then **Run**. Complete any device trust/signing prompts.
5. On the device, open **Settings → Apps → Safari → Extensions → Instagram Following**. Turn it on and allow access to **instagram.com**. On iOS 17, the path starts at **Settings → Safari**.
6. Open instagram.com **in Safari**, grant website access if prompted in the page menu, and reload existing Instagram tabs. Leave #blockit enabled.

The containing app only shows setup instructions; you do not need to leave it open. Installing through Xcode requires Apple’s device signing/provisioning. Long-term distribution through TestFlight or the App Store requires the corresponding Apple Developer setup; no published App Store build is included.

## Test on macOS Safari

1. Open the same Xcode project and select **Instagram Following (macOS)** → **My Mac**.
2. Use your development team, or **Sign to Run Locally** for local testing, for the macOS app and extension targets. **Run** the app.
3. For an ad-hoc/local build, enable Safari’s developer features in **Safari → Settings → Advanced → Show features for web developers**, then choose **Develop → Allow Unsigned Extensions**. Safari may require this again after restarting. Some newer Safari versions put this option in **Settings → Developer**.
4. In **Safari → Settings → Extensions**, enable **Instagram Following** and allow it on **instagram.com**. The app’s settings button opens this pane.
5. Reload Instagram and complete the checklist below. The Mac app targets macOS **12 or later**; use a current Safari (at least Safari 16.4 is recommended).

The extension does not request access to other sites. If it appears enabled but does nothing, check **website access**, not just the extension’s on/off switch. Private Browsing may need separate permission.

## How it works

`extension/` is the source of truth. The Xcode project references these files directly; edit them and rebuild, with no bundler or copy step.

1. **Page loads:** `rules.json` contains two static `declarativeNetRequest` rules. A main-frame request to Instagram’s exact root path is redirected by replacing/adding `variant=following`; a higher-priority allow rule lets Following load without a redirect loop. Other query parameters are retained. No API, image, script, or subframe requests are redirected. The allow rule is local to this extension; it does not disable #blockit.
2. **In-page navigation:** `content.js` runs at `document_start`, rewrites feed links, and captures ordinary feed taps before Instagram’s router handles them. It uses a **real page navigation**, not `history.replaceState`, so Instagram loads the correct feed data. Automatic redirects replace the unwanted history entry rather than adding a Back-button trap.
3. **Fallbacks:** DOM changes, Back/Forward, restored pages, and foregrounding trigger URL checks. A lightweight 500 ms URL-only check catches `pushState`/`replaceState` transitions that cause no DOM mutation. The timer skips hidden tabs. No history monkey-patching, injected page scripts, or extra background permissions are needed.
4. **UI:** URL-identifiable unwanted feed choices are hidden. The normal Home link is rewritten to Following. The actual iPhone markup puts the chevron and Following title inside the same root-feed link. The content script marks root-feed links, and CSS hides only the chevron’s wrapper by matching its SVG path. No semantic `<header>` or English label is assumed; the title stays visible, dialogs are excluded, and other routes are unaffected. Newly inserted/reused links are processed in batches, without repeatedly scanning the entire page. Unrelated pages and links remain intact.

Instagram controls its UI and feed availability. If it changes the `variant` parameter or replaces its feed links with different controls, the extension may need updating. A URL-only in-page transition can briefly display the previous feed before the fallback check runs. Navigating Home deliberately reloads the document instead of attempting to manipulate Instagram’s private application state.

## Development and tests

Node.js 18+ is needed **only for tests**, not building or running the extension:

```sh
npm ci
npm test
```

Tests cover URL scope, query/hash preservation, duplicate variants, no-loop rule behavior, dynamic tabs/links, click handling, in-page navigation, visibility, and history events. The mobile heading regression tests use the actual HTML supplied from iPhone Web Inspector, saved in `test/fixtures/mobile-following-heading.html`, and check that only the arrow wrapper is hidden. The DOM tests use jsdom with navigation/timers stubbed; the network-rule tests model the static rules. They are **not** a substitute for running Safari or checking Instagram’s live markup. If Instagram changes the chevron’s SVG geometry, update the selector and captured fixture together.

On macOS, also run the native WebKit layout smoke test:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun swift scripts/test-mobile-layout.swift
```

It loads the captured HTML locally in a 390×844, non-persistent `WKWebView` and checks that the arrow’s inline `display: inline-block` is correctly overridden by our stylesheet’s `!important`, without hiding the shared title. It also checks link rewriting and route/dialog scoping, including an English-label variant. This test does not access your Instagram account or require Safari automation permissions. It evaluates the content script after the fixture loads to test layout in an offscreen view; it does not test extension injection timing.

The project was generated using Xcode 27.1. If an older Xcode cannot read its project format, move the existing `safari/Instagram Following` folder aside and run:

```sh
npm run xcode:generate
```

This runs Apple’s `safari-web-extension-converter` for both platforms, references `extension/`, and refuses to overwrite an existing project. It creates Apple’s default native app scaffold; custom instructions/UI and signing settings in the included project are not automatically reapplied. Full Xcode is required, not just Command Line Tools. Set `DEVELOPER_DIR` if your Xcode is installed somewhere other than `/Applications/Xcode.app`.

### Command-line build checks

These build locally without a paid signing identity. They do **not** install on a physical iPhone or automatically enable Safari’s extension.

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer

xcodebuild -project "safari/Instagram Following/Instagram Following.xcodeproj" \
  -scheme "Instagram Following (macOS)" -configuration Debug \
  -destination "platform=macOS" -derivedDataPath build/macos \
  CODE_SIGN_IDENTITY=- build

xcodebuild -project "safari/Instagram Following/Instagram Following.xcodeproj" \
  -scheme "Instagram Following (iOS)" -configuration Debug \
  -destination "generic/platform=iOS Simulator" -derivedDataPath build/ios \
  CODE_SIGNING_ALLOWED=NO build
```

### Manual Safari acceptance checklist

With the extension and #blockit enabled, logged into Instagram:

- [x] Open `/`, `/?variant=home`, and `/?variant=home&utm_source=test`: Following loads, retaining the extra query parameter.
- [x] Open `/?variant=following` directly and reload: no redirect loop.
- [x] Confirm the visible feed is Following, not merely that the address changed.
- [x] For you is hidden where Instagram renders it as an identifiable feed link/tab; any remaining control cannot leave the page on `variant=home`.
- [x] The back-to-home arrow beside Following is hidden; the Following heading, normal Home navigation, and Back controls on profiles/posts/dialogs remain visible.
- [x] Visit a profile or post, then tap the Instagram logo/Home: Following loads.
- [x] Use Back/Forward and restore/background/foreground the tab: the main feed stays on Following.
- [x] Long-press Home → Open in New Tab on iOS; Command-click Home on macOS: the new tab opens Following.
- [x] Profiles, individual posts, messages, and login still work.
- [x] #blockit still removes/blocks Reels, Discover, and Explore as before.

## License

[MIT](LICENSE) © 2026 Nils Krüger.

## Icon artwork

The icon combines an Instagram-inspired gradient and camera outline with a 🫂 overlay rendered using macOS’s Apple Color Emoji font. Instagram’s trademarks and third-party emoji artwork remain the property of their respective owners; they are not licensed by this project’s MIT license. This project is not affiliated with Instagram or Apple.

To regenerate every extension icon, iOS/macOS app icon, and setup-screen image:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun swift scripts/generate-icons.swift
```

The generator uses AppKit with no additional dependencies. iOS icons are opaque so the system can apply its icon mask; macOS icons include rounded corners and Dock padding. Generated PNGs are included, so building the extension does not require running the generator.

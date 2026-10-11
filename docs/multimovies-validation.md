# MultiMovies Vega fix — review and validation

Prepared 2026-10-11. The user subsequently approved publishing this fix to main for testing in Vega.

## Source revisions inspected

- Provider: `MoonDevil1/vega-providers` at `1d75f2f224a20f42cedfa50e0545069a020f8f2a`.
- App: `MoonDevil1/vega-app` at `956673e80a04aae87ef6eb0e3536b7a9cb83a1f5` (package version 5.0.3).
- Current-theme reference: `KSHITIJ8473/raghav` at `3a5cbc43a2bf573ef100d528cf6476edaa53924a`, especially `MultimoviesProvider.kt`, `MMModiplay.kt`, and `MMSources.kt`.
- Nuvio reference: `phisher98/phisher-nuvio-providers` at `91cc7194f2b814645f20832d98c8a3d9b6fc6dfc`, `src/providers/multimovies.js`.
- Also inspected `phisher98/nuvio-providers` at `6f88d1c6bddabf30d0768d76224d600ac32bab7c`: no MultiMovies module in this tree.

The Nuvio reference targets an older WordPress layout, searches with `?s=`, and uses `doo_player_ajax`. The live Garden site and Kotlin reference use `/search?q=`, `article.poster-card`, season query parameters, and `watchConfig.initialServers`. Copying the old WordPress flow into this provider would not match the inspected live pages. The Nuvio return shape also differs from Vega's.

## Findings and exact changes

| Area | Evidence | Prepared change |
| --- | --- | --- |
| Playback contract | Vega `ProviderManager.getStream` invokes the standalone `stream` module's `getStream`, then enforces `Stream[]`. The original module returns an object. Its `index.ts` adapter is not used by this route. | `stream.ts` returns `Stream[]` on every successful path, with subtitles attached to streams. `index.ts` delegates to the same implementation. |
| Repeated verification | Vega executes each invocation in a fresh worker. Module-local flags and promises reset. Original posts code prompts after arbitrary network errors, stores a session only for posts/search, and metadata/episodes/streams use a different UA. | New bundled `http.ts` handles all site-page requests, persists origin-scoped cookies and UA, recognizes actual challenge responses, and propagates other failures. A persistent pending marker coordinates callers; a 30-second retry cooldown stops cancellation/failure prompt storms. An expired session can be renewed. Verification is bounded to leave room in Vega's 120-second invocation budget. |
| Wrong category/posters | Vega coalesces verification by author/host/cookie. Original provider records the caller's URL instead of the returned WebView URL, allowing HTML from another category to be reused. | Only use WebView HTML when `result.url` equals the requested URL. Otherwise fetch the requested page with the solved session. Cookie-only results also retry correctly. |
| Missing or wrong poster fallback | Current live catalog parses successfully; the historical blank-poster symptom was not reproduced on the current snapshot. The broad image fallback can accept navigation/ad images; metadata falls back to the first page image, which can be the site logo. | Limit fallback posts to media-detail routes; support anchor text titles. Metadata prefers its detail poster or media JSON-LD and no longer uses an arbitrary first image. |
| Season selection | Current live Reacher metadata already lists separate seasons. No evidence that the app currently flattens this response. Dynamic links unnecessarily include `directLinks: []`. | Omit `directLinks` on dynamic season entries, matching the documented contract. Reuse verified session during episode fetches. |
| Episode ranges | Original code excludes range zero, infers the active range from the URL rather than the selected option, and hides failed ranges as empty arrays. | Fetch unselected range options, including zero, filter to the requested season, deduplicate/sort episodes, and propagate failures instead of silently returning a partial season. |
| Pagination/search | Live current routes work. Catalog page parameter preserves filters; `/search?q=` matches the current site. | Preserve these routes, return immediately for blank queries, and add tests for query encoding, page parameters, empty results and session reuse. |
| Server resolution | Shared `streams.length` could skip another server's fallback; direct media server URLs were fetched as HTML; nine Bingr attempts were sequential; watchConfig matching required exact spacing. | Give each server its own results, preserve server order, recognize direct media, bound requests and pass cancellation, run independent Bingr attempts concurrently, and accept assignment whitespace. Never return an unresolved HTML embed as playable media. |

Provider release version is prepared as **1.2.2**. The app repository is unchanged. Five affected `dist/multimovies/*.js` bundles are rebuilt; `catalog.js` and shared utility bundles are unchanged. No third-party dependency was added.

## Automated validation

Run from the provider repository, with the app checkout alongside it:

```sh
npm ci --ignore-scripts
npx tsc --noEmit
VEGA_APP_DIR=../vega-app npm run test:multimovies
```

- TypeScript type check: passed.
- Required production bundle build: passed.
- Regression and app-contract tests: 20 passed, zero failed or skipped with `VEGA_APP_DIR` set.
- `git diff --check`: passed.
- Tests load each built provider module into a fresh VM realm, exercising loss of module-local state across calls.
- App-contract test executes the actual inspected `ProviderManager` implementation with native/storage/worker boundaries mocked. Dispatch and array validation are real app code.
- Before/after proof: running that same app-contract test against the original committed `dist/multimovies/stream.js` fails with `Provider multimovies getStream returned object, expected an array`; the rebuilt module passes.

The suite covers posters, metadata poster fallback, catalog pagination, encoded search, empty search, transient network failure, HTTP 403 challenge handling, fresh-invocation session reuse, concurrent callers, wrong-page verification HTML, cookie-only results, cancellation cooldown, expired-session renewal, season links, range zero, season filtering, partial-range failure, direct-media servers, independent server fallback, and rejection of unresolved HTML embeds.

## Live checks

Live HTTP snapshots were fetched from the public site during this session and parsed by the built modules. Stream resolution executed the built `getStream` against live endpoints. A curl-backed axios-shaped test adapter was used for stream HTTP because Node axios received HTTP 502 `upstream failure` from this environment; this is explicitly not the Android HTTP implementation.

| Check | Observed result |
| --- | --- |
| `/movies` | 30 posts with title, absolute detail URL and poster URL |
| `/movies?page=2` | 30 posts; zero detail-URL overlap with page 1 |
| `/search?q=Reacher` | Jack Reacher: Never Go Back; Jack Reacher; Reacher |
| `/series/reacher-36096` | Four separate season choices |
| `/series/reacher-36096?season=2` | Eight episodes, S2E1 through S2E8; no other-season episodes |
| Reacher S2E1 live `getStream` | Two streams: VIDOUT and Filmu, both declared `m3u8` |
| VIDOUT stream master playlist | Valid `#EXTM3U`, Hindi and English audio entries and video variants |
| VIDOUT child playlist | Valid HLS VOD playlist with media segment entries |
| VIDOUT media segment byte-range request | HTTP 206; 1,024 bytes; content type `video/MP2T` |
| Jack Reacher movie live `getStream` | Filmu returned one HLS source; its URL returned a valid `#EXTM3U` master playlist. VIDOUT mapping for this movie returned HTTP 404, without suppressing Filmu |

The live site labels are reported as returned, not independently verified media-release information. Signed source URLs and verification cookies are not included in this report.

## Limits and approval boundary

No Android emulator or `adb` is available here. Actual Vega UI, device WebView cookie behavior, audio/video decoding and long-running playback have **not** been tested. This is a verified contract fix plus live catalog/source/playlist/media-byte validation, not a claim of device end-to-end success.

Not every reference extractor is ported: Cineverse/Modiplay, GD mirror and VidBolt can require host-specific logic beyond the existing generic fallback. The live checks established usable VIDOUT/Filmu paths for the selected episode and Filmu for the selected movie, not universal title/server coverage. Live hosts and challenge policies can change.

Publication approved by the user: update `MoonDevil1/vega-providers` on `main` with version 1.2.2 and the rebuilt provider bundles so Vega can retrieve the fix. No app repository change or APK release is included. Refresh the provider in Vega and confirm version 1.2.2 before testing.

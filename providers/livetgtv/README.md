# LiveTGTV V1 — optional MediaFlow HLS bridge

This provider uses only LiveTGTV V1, never V2. The V1 endpoint fields remain unverified against the live website.

## Configure
1. Run your own [MediaFlow Proxy](https://github.com/mhdzumair/mediaflow-proxy), securely accessible from the Android device.
2. In Vega Provider Manager, open the LiveTGTV V1 settings and set `mediaflowUrl` to your HTTPS MediaFlow host. Set `mediaflowPassword` to match the proxy configuration.
3. Refresh/reinstall provider 0.2.0 after its GitHub Actions build completes.
4. A V1 MPD is presented as HLS `m3u8` through `/proxy/mpd/manifest.m3u8`, using the source URL's fresh token.

If the V1 response includes authorized ClearKey `drm.keyId` and `drm.key`, these are passed to your proxy. **Security:** these values and the proxy password are part of the generated URL. Only use your own trusted proxy. Do not paste or log stream URLs or expose the proxy publicly. URLs may also expire.

If no proxy is configured or the necessary keys are absent, the provider falls back to direct MPD. DRM-protected playback then may fail. This is NOT an independently verified working stream fix.

No changes are required to the Vega player for HLS playback. The optional settings API must be supported by the installed app version.

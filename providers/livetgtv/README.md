# LiveTGTV V1 (experimental)

This provider uses **V1 only**, never V2. V1 API routes here were supplied in prior project discussion; the site could not be reached during implementation, so the API shapes/endpoints are **unverified**.

- Channel list: GET `/api/public/channels`.
- Channel metadata/playback: GET `/api/public/channels/{id}`.
- Supports channel listing, local title search, channel metadata and directly playable HLS/MP4 sources.
- **Known limitation:** MPEG-DASH streams protected by ClearKey are *not* playable via this provider yet. Vega's Stream interface has no verified DRM fields; changing `.mpd` into `.m3u8` is not a conversion. This implementation deliberately returns no stream for such a channel rather than claiming playback will work.
- No V2 fallback or API calls. Does not modify Multimovies.
- Requires build output in `dist/livetgtv` before Vega can install the new provider.

Please verify the V1 API schema against an authorized sample before declaring playback support.

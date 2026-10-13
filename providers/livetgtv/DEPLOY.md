# LiveTGTV V1 companion converter

**No change to Vega's video player is required** for HLS playback. The converter lives in this provider repository, but it must run on a computer/server with Docker; installing a Vega provider does not execute Docker, Node, or FFmpeg.

## Run
1. Install Docker Compose on a machine you control.
2. Copy `.env.example` to `.env` and set a strong `MEDIAFLOW_API_PASSWORD`.
3. From `providers/livetgtv`, run `docker compose up -d`.
4. The service binds to `127.0.0.1:8888` only. Set up an HTTPS reverse proxy with access controls that your Android device can reach.
5. In Vega's LiveTGTV V1 provider settings, set `mediaflowUrl` to your HTTPS reverse-proxy origin and `mediaflowPassword` to the configured API password.
6. Reinstall or refresh the provider after its build.

This is a deployment configuration, **not** a guarantee of playback. For encrypted MPD, conversion requires the necessary authorized key material; if it is absent or incompatible, playback fails. LiveTGTV V1's live API playback schema has not been verified. Do not expose a publicly accessible converter with a weak password. Proxy URLs may contain credentials and should not be shared or logged.

The `converter-server.cjs` file is an alternative FFmpeg implementation for **unencrypted** DASH only; it is not automatically invoked by the provider. The currently wired integration uses the MediaFlow endpoints in `proxy.ts`.

Documentation: https://github.com/mhdzumair/mediaflow-proxy

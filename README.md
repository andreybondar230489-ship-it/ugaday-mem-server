# Ugaday Mem HTTPS relay (work in progress)

This relay is a **transport component**, not yet a usable 6.5 game server. The host Android app must be modified to establish an outbound WebSocket connection and handle forwarded requests. Until then, the service only answers `GET /health`.

## Render web service

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Environment variable `RELAY_SECRET`: **generate a unique secret of at least 32 random characters** in Render; do not commit it to GitHub.
- Render supplies a public HTTPS address and its own `PORT`.

## Protocol for the future Android integration

1. Host opens `wss://<render-host>/host?secret=<RELAY_SECRET>`.
2. Relay returns `{"type":"session","session":"...","playerBase":"/play/.../"}`.
3. Players connect at `https://<render-host>/play/<session>/...`.
4. Requests are forwarded as WebSocket JSON messages with `type=request`, `id`, `method`, `path`, `contentType`, and base64 `body`.
5. The Android host must answer as JSON `type=response`, matching `id`, numeric `status`, string `contentType`, and base64 `body`.

## Important limitations

- The current Ugaday Mem 6.5 APK **does not yet implement this protocol**. Deploying this repository alone will NOT enable player camera preview.
- This early prototype is for controlled testing only: photos are relayed through Render memory; no storage is provided. Session IDs are random access tokens for players. The host secret should be kept private.
- Render free-tier restrictions, service sleep, request size limits, and potential network costs must be checked before using with a real party.
- Before production use, review authentication, rate limiting, privacy, request and upload limits, reconnect behavior, and 10-player concurrency.

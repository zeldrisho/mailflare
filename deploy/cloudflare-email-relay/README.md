# Mailflare email relay

A small Cloudflare Worker for self-hosted Mailflare installs that want to keep
receiving mail through Cloudflare Email Routing (no port 25, no MX changes).

## Install and configure

From the repository root, install workspace dependencies:

```sh
vp install
```

Authenticate with Cloudflare, then configure the two Worker secrets. `cf` does
not yet support setting individual secrets, so these commands intentionally use
Wrangler and explicitly target this Worker:

```sh
vp exec wrangler secret put MAILFLARE_URL --name mailflare-email-relay
vp exec wrangler secret put INBOUND_WEBHOOK_SECRET --name mailflare-email-relay
```

`MAILFLARE_URL` is the public URL of your server (for example,
`https://mail.example.com`). `INBOUND_WEBHOOK_SECRET` must match the server's
inbound webhook secret.

## Develop, build, and deploy

Run these commands from this directory:

```sh
vp run dev
vp run typecheck
vp run build
vp run deploy
```

The commands use Cloudflare's `cf` CLI. Wrangler remains a development
dependency only for the individual-secret commands above.

After deployment, in the Cloudflare dashboard under Email Routing for your
zone, route the catch-all or selected addresses to the `mailflare-email-relay`
Worker.

Each message is posted to `/api/inbound` on your server with an HMAC signature.
The server stores it and replies with the routing decision, so reject rules and
forwarding rules still act at Cloudflare's edge. If the server is unreachable
the message is rejected with a retry hint.

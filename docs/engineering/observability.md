# Observability and privacy-preserving logging

## Scope

This is the deliberately small observability baseline for the public JoinSplit
beta showcase. It uses the existing single Render service and Laravel/Apache
capabilities. It adds no analytics SDK, log collector, error-reporting SaaS or
second public ingestion endpoint.

The baseline helps answer three operational questions:

1. Is traffic reaching the service and how does it respond?
2. Which retained error belongs to a user-reported failed request?
3. Can an operator diagnose the failure without retaining request or domain
   data?

It is not behavioral analytics, user tracking, an SLA monitor or a complete
production observability platform.

## Central showcase usage

The production Web/PWA client reports at most one coarse app-load event per
loaded document to the separately operated ATM showcase service. The endpoint
is configured explicitly as `NUXT_PUBLIC_SHOWCASE_TRAFFIC_URL`; local and test
environments leave it empty. Native builds, automated browsers, prerendered
documents that are never activated and browsers with Global Privacy Control
enabled do not report an event.

The request contains only the fixed fields `version=1`, `site=joinsplit` and
`path=/app`. It uses no cookie, browser-storage marker, account ID, visitor ID,
navigation path, query string or referrer. The browser necessarily establishes
a network connection to the central service, but the JoinSplit contract permits
that service to store only a daily aggregate for this site. In particular, the
portfolio service's pseudonymous IP/browser HMAC must not be applied to
JoinSplit events.

JoinSplit exposes neither a local statistics table nor a public read endpoint.
The figures belong exclusively in the authenticated ATM operator report.
Reloads can count more than once, while blockers, Global Privacy Control,
network failures and service cold starts can reduce the result. It is therefore
an app-load estimate, not a unique-person or unique-browser count.

The ATM endpoint and private report must be deployed before enabling the
JoinSplit production configuration. The statistic must not be extended with
routes, cohorts, account association or a persistent identifier without a new
product and privacy decision.

## Traffic log

Apache is the sole per-request traffic logger across Laravel API/health traffic
and Nuxt pages/assets. Each request produces one line on standard output
containing only:

- a server-generated request ID,
- HTTP method and final status,
- response byte count,
- server-side duration in microseconds.

It deliberately excludes URL and query string, source IP, host, referrer, user
agent, cookies, headers and request/response bodies. Laravel and Nuxt do **not**
log a second line for every successful request: that would double volume and
cost without adding useful evidence on the Render Free deployment.

Laravel and Nuxt each generate a fresh UUID and return it as `X-Request-ID`;
neither application echoes a caller-provided ID. After the response, Apache
records that response header in the traffic line. This avoids exposing Apache's
`mod_unique_id`, which encodes unnecessary process and time information. A
response that fails before an application can set the header is logged with a
missing-ID marker and can only be correlated by time and status.

## Error and exceptional-status reporting

Laravel adds the same `X-Request-ID` to ordinary and rendered exception
responses. The application writes explicit operational events only for:

- `http.rate_limited` at warning level for HTTP 429,
- `http.server_error_response` at error level for an explicitly returned 5xx,
- `application.exception` at error level for an unhandled production
  exception.

These records contain only request ID, HTTP method, coarse surface (`api`,
`health` or `frontend`), status/duration where applicable, and for an unhandled
exception its PHP class and repository-relative source location. Production
exception messages, stack arguments, URLs, identities and payloads are not
copied into the Laravel runtime log. Local and test environments keep Laravel's
normal detailed exception reporting for development diagnostics.

Ordinary Nuxt responses carry the request ID. The current Nitro process writes
its own framework errors to standard error, however, and Nitro's error handler
may replace response headers. Apache always records the failed request and its
status, but its request-ID field can therefore be missing for a Nuxt failure.
JoinSplit does not claim that all Nitro diagnostics are sanitized or correlated.
Adding a second custom error line would not suppress Nitro's original line and
would create misleading duplication. A custom Nitro error handler is deferred
until a real incident justifies owning that response/error boundary.

## Why there is no client error intake or external reporting service

A browser error endpoint would be a new unauthenticated, abuse-prone ingestion
surface. Accepting arbitrary client messages or stack traces would also make it
easy to store names, expense text, URLs or browser data accidentally. It is not
justified for the current low-traffic showcase.

An external error-reporting SaaS would add a processor, credentials, SDK/runtime
cost, a second retention configuration and consent/privacy work. Render runtime
logs already cover the present operational need without a new dependency. A
SaaS decision should be revisited only after measured incidents show that this
baseline cannot diagnose real failures; provider region, DPA, data scrubbing,
retention and cost must then be approved explicitly.

## Operator workflow

1. Ask for approximate time, action, visible HTTP status and `X-Request-ID` if
   the reporter can obtain it from browser network diagnostics. Never request a
   password, Access Identity credential or financial payload.
2. Search the retained Render runtime log for the exact request ID.
3. Compare the Apache traffic row with the Laravel exceptional-status or
   exception event when the request reached Laravel.
4. Use exception class and source location to reproduce locally with fictional
   data. Do not enable production debug output.
5. Record the resolution without copying user data from production.

The existing seven-day maximum for data-bearing runtime logs still applies.
Render build/deploy logs and provider metadata must remain free of user data
and secrets. Render Free does not provide reliable threshold alerting or a
continuous availability guarantee; the manual checks in
[`deployment-runbook.md`](deployment-runbook.md) remain necessary.

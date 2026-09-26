# Render and Neon Deployment Runbook

## Purpose and authority

This runbook describes the first production deployment of JoinSplit to Render
and Neon. The committed `render.yaml` is the canonical infrastructure template.
It is not authorization to enter secrets, change DNS, deploy, or publish source
code. Each external change remains behind explicit human approval.

The canonical public origin is `https://joinsplit.tiny-bits.org`.

## Fixed deployment boundary

- Render region: Frankfurt
- Neon region: AWS `eu-central-1` (Frankfurt)
- application: one free Docker web service containing Node 24 Nuxt, PHP 8.5
  Laravel, Apache and the Laravel scheduler
- database: Neon Free PostgreSQL
- cleanup: Laravel scheduler while the service is awake, plus cleanup on every
  cold start
- source: GitHub `main`, with automatic deploys disabled

Only the combined service owns the custom domain. Apache sends `/api/*`, `/up`,
and `/ready` to Laravel and proxies all other paths to Nuxt inside the same
container. This preserves the required single browser origin.

Laravel connects to Neon using `sslmode=verify-full` and the system CA bundle.
The complete Neon connection string is a Render secret and must never be
committed, pasted into logs, or exposed to the frontend.

## Cost boundary

The selected baseline costs USD 0 per month within provider free-tier limits:

- one Render Free web service,
- one Neon Free project,
- no paid Render private service or cron job.

Render can suspend the service when free instance hours, bandwidth, build
minutes, or outbound-traffic limits are exhausted. Neon can suspend compute
when its free allowance is exhausted. A payment method can turn some overages
into charges, so the Render spend limit and provider usage alerts must be set
before release. Upgrading either provider requires a new human decision.

## Required inputs

Before creating resources, confirm:

- the approved Git commit and green CI run,
- the Render workspace and billing method,
- the Neon project owner and billing method,
- the named incident operator and alert destination,
- access to DNS for `tiny-bits.org`,
- confirmation that both resources show the Free plan before creation.

## Create the Neon database

1. In Neon, create a project in AWS `eu-central-1`.
2. Select the Free plan. Accept that it provides only the provider's short
   restore history and no portfolio recovery guarantee.
3. Keep the generated production role and database dedicated to JoinSplit.
4. Copy the pooled connection URL once into a password manager. Store only the
   `postgresql://...` URL, without a surrounding `psql` command or quotes, and
   replace Neon's `sslmode=require` query value with `sslmode=verify-full`.
   Do not send the resulting URL through chat or commit it.
5. Copy the direct connection hostname separately. It must be the same Neon
   endpoint without the `-pooler` suffix; it contains no password.
6. Confirm that both hostnames end in `.neon.tech` and the connection uses TLS.
7. Do not create development or CI databases in the production project.

The pooled connection string is later entered as the combined service's
`DB_URL`, while the direct hostname is entered as `DB_DIRECT_HOST`. Laravel
uses the pooler for application traffic and the direct endpoint for migrations
and other schema operations. `DB_POOLED=true`, `DB_SSLMODE=verify-full` and
`DB_SSLROOTCERT=/etc/ssl/certs/ca-certificates.crt` remain separate variables.

## Pre-deployment verification

From the approved repository revision:

1. run the complete backend and frontend test suites,
2. run strict TypeScript and the production Nuxt build,
3. build the Laravel Docker image,
4. inspect `render.yaml` and confirm automatic deploys are off,
5. confirm that no secret is present in source or build output,
6. confirm the cleanup command is covered by tests.

Do not proceed if the working tree differs from the approved commit or CI is
not green.

## Create the Render services

1. In Render, create a Blueprint from the JoinSplit GitHub repository.
2. Confirm that `render.yaml` proposes exactly one Frankfurt web service with
   the Free compute plan. Stop if Render proposes a paid service.
3. Locally run `php artisan key:generate --show` once. Store the complete
   `base64:...` result in a password manager; do not paste it into chat.
4. Enter that value as the service's `APP_KEY`. A plain Render-generated Base64
   value is not a valid substitute because it lacks Laravel's `base64:` key
   encoding.
5. Enter the prepared pooled Neon connection URL as `DB_URL` and the direct
   Neon hostname (without credentials or `-pooler`) as `DB_DIRECT_HOST` when
   prompted. Startup rejects a URL-level `sslmode` that weakens `verify-full`.
6. Apply the Blueprint only after the cost summary matches the approved plans.
7. Trigger the deploy. Container startup validates configuration, runs
   idempotent migrations and performs retention cleanup before serving traffic.
8. Verify `/up` and `/ready` before changing DNS.
9. Verify scheduler and startup-cleanup output contains no identifiers or
   financial data.

## Domain and release verification

1. Add `joinsplit.tiny-bits.org` to the public Nuxt service.
2. Add the exact DNS record shown by Render at the DNS provider.
3. Wait for Render's TLS certificate to become valid.
4. Verify HTTP-to-HTTPS and Render-hostname redirects to the canonical origin.
5. Verify the application shell and one bounded create/update/delete workflow.
6. Verify `/ready` through the canonical domain and confirm there is no separate
   public Laravel service.
7. Record the commit, Render deploy identifiers, migration result, smoke-test
   result, and operator.

Do not place real names or financial data in the smoke test.

## Monitoring and recovery

Render runtime logs for the selected workspace must be verified to retain
data-bearing logs for no more than seven days. Alerts cover failed deploys,
readiness, 5xx rates, failed cleanup runs, domain/TLS failures, and database
capacity. A controlled alert test is required before launch.

Neon Free's short restore history is best-effort infrastructure recovery, not a
portfolio guarantee or user backup. A paid restore window is deliberately
deferred until the showcase demonstrates a real need.

## Rollback

Use Render's retained successful deploy to roll application code back. Do not
run `migrate:rollback` automatically. A database restore is a separate,
explicit incident decision because it can discard accepted mutations. Keep the
service unavailable if the previous application revision is incompatible with
the current schema.

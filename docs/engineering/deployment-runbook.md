# Web Portfolio Deployment Runbook

## Purpose and authority

This runbook operationalizes the repository-owned boundary in
[production-operations.md](production-operations.md). It does not authorize a
deployment. Creating paid resources, applying the App Platform specification,
running production migrations, switching DNS or publishing a release each
requires the named human operator's explicit approval.

The canonical template is [.do/app.yaml](../../.do/app.yaml). It deliberately
contains blocking CHANGE_ME values and references an existing production
PostgreSQL cluster. Applying the committed file unchanged must fail; it must
never create a development database as a fallback.

## Fixed release boundary

- Region: DigitalOcean Frankfurt (fra).
- Components: one Node 24 Nuxt service and one PHP 8.5 Laravel service.
- Database: existing Managed PostgreSQL 18 Standard Edition cluster.
- Browser origin: https://joinsplit.tiny-bits.org.
- Source deployment: GitHub main, with deploy_on_push disabled.
- Ingress order: /api, /up and /ready to Laravel; all other paths to Nuxt.
  Prefixes are preserved.
- Laravel readiness uses /ready; liveness uses /up.
- Nuxt readiness and liveness use /health.
- The checked-in 512 MiB service sizes are provisional. They cost USD 5 per
  service per month at the time of JS-029 and require measured runtime memory
  verification before provisioning. A change that makes the total expected
  monthly cost exceed USD 35 requires a new human decision.

The buildpack choice is intentional. DigitalOcean's current buildpacks support
the repository's Node 24 and PHP 8.5 ranges. A Dockerfile is not introduced
without a concrete buildpack limitation.

## Inputs that must exist before applying the spec

Record these values in the private release record, never in Git:

- named release and incident operator,
- alert destination,
- public operator and privacy contact,
- approved commit and successful CI run URL,
- existing Managed PostgreSQL cluster name,
- production APP_KEY,
- base64-encoded Standard Edition CA certificate,
- current backup timestamp and verified seven-day recovery policy,
- measured frontend and backend peak memory,
- expected monthly cost.

Replace both APP_KEY placeholders, both CA placeholders, and the PostgreSQL
cluster placeholder in a private working copy. Do not print or check in the
rendered spec. Configure deployment and domain alerts to the approved
destination in DigitalOcean before production traffic is enabled.

## Database preparation

1. Create or select PostgreSQL 18 Standard Edition in FRA1 only after the cost
   gate is approved.
2. Attach the App Platform app and database to the same VPC and restrict the
   database trusted sources to the app and explicitly approved operator access.
3. Create the joinsplit database and least-privileged joinsplit_app user
   represented by the App Spec.
4. Enable verify-full, download the Standard Edition CA certificate and encode
   it as a single-line base64 secret.
5. Confirm that the App Platform binding resolves the private database URL; a
   public database URL is rejected by the Laravel production validator.

At runtime backend/bin/with-production-database-ca writes the decoded CA with
owner-only permissions to the absolute DB_SSLROOTCERT path, then replaces
itself with the requested process. It never prints the certificate or database
URL.

## Pre-deployment verification

1. Confirm the approved commit is on main and its full CI run is green.
2. Work from a private copy of .do/app.yaml; replace every blocking value.
3. Validate the complete spec with the current DigitalOcean CLI/API without
   creating or updating an app.
4. Confirm both services and the migration job still disable deploy_on_push.
5. Confirm the canonical domain, TLS 1.3, ingress order, health checks and
   private database binding.
6. Confirm debug is disabled, logs use stderr, the client origin is exact,
   database TLS uses verify-full, only REMOTE_ADDR is trusted as proxy, and
   secrets have runtime-only scope.
7. Verify the latest managed backup and record the operator, commit, CI run,
   expected cost and rollback target.

## Deployment

After a separate explicit human deployment approval:

1. Submit the private rendered spec or update the existing app with it.
2. The single PRE_DEPLOY job materializes the CA, validates production
   configuration and runs php artisan migrate --force exactly once.
3. App Platform must keep traffic away from Laravel until /ready succeeds.
   /ready performs a minimal database query, rejects pending migrations and
   returns only ready or unavailable.
4. Verify /up, /ready, /health, the application shell and one bounded API flow
   through the canonical domain.
5. Verify the starter domain redirects to the canonical domain. The starter
   hostname is only known after app creation, so its explicit redirect is added
   to the private live spec during this step and retained in release evidence.
6. Verify the security headers, exact CORS response and absence of cacheable
   authenticated responses.
7. Record the deployment ID, migration result, smoke result and operator.

No deployment command may run test seeders, migrate:fresh, destructive cleanup
or rollback migrations.

## Rollback

If configuration validation, migration, readiness or smoke verification fails,
do not route normal traffic to the candidate. Select the preceding retained
App Platform deployment only when it is compatible with the now-current
database schema. Do not run migrate:rollback as part of application rollback.

A database restore is a separate destructive recovery decision. Restore only
into an isolated non-production cluster first, verify the recorded RPO/RTO and
obtain explicit human approval before any production recovery action.

## Evidence required to close JS-029

- repository tests and production builds pass,
- the template parses and retains every blocking placeholder,
- fail-fast tests cover unsafe origins, debug mode, public database hosts,
  missing CA, weak TLS, file logging and proxy trust,
- /ready and security headers are tested,
- no DigitalOcean resource, secret or deployment was created by JS-029.

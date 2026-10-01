# JoinSplit API

The canonical, machine-readable API description is
[`openapi.json`](openapi.json). It documents the currently registered Laravel
routes, their authentication modes, mutation headers, request bodies and core
response shapes.

## Import into Postman

1. In Postman, choose **Import**.
2. Select `docs/api/openapi.json` from this repository.
3. Import it as a collection.
4. Set the imported collection's base URL to `http://127.0.0.1:8000` for local
   development. Current Postman versions normally expose it as `baseUrl`; if
   the importer keeps the server URL literally, edit that collection URL.

The specification uses examples and placeholders only. Never put a real
password, bearer credential or production session cookie into the versioned
file.

Postman imports the request definitions, but it cannot infer JoinSplit's full
client workflow. In particular, UUIDs, revisions and CSRF tokens must be
carried from earlier responses into later requests.

## Authentication modes

### Anonymous/local-first mutations

Anonymous routes under `/api/groups` use both headers below:

- `X-Access-Identity-ID`: a client-generated UUID v4.
- `Authorization: Bearer <credential>`: a client-generated, lowercase
  64-character hexadecimal value (32 random bytes).

Register the pair first with `POST /api/access-identities`. The server stores
only a digest of the bearer credential. It cannot recover a lost credential.
The same two headers are required for every later anonymous mutation.

There are deliberately no anonymous read endpoints: the local-first client
reads its IndexedDB state and synchronizes mutations to the server.

### Account session

Account routes use Laravel's server-side session:

1. `GET /api/account/csrf` and save `data.csrfToken`.
2. Send it as `X-CSRF-TOKEN` on every state-changing account request.
3. Register or log in. Postman must retain the `joinsplit_session` cookie.
4. Use `GET /api/account/workspace` for the Account read model.

Postman normally retains cookies for the selected `baseUrl`. If it does not,
enable its cookie jar for that host. The OpenAPI `cookieAuth` definition is
documentation of the runtime contract; users should not copy session cookies
manually between environments.

Account workspace mutations additionally require:

- `X-Mutation-ID`: a fresh UUID v4, stable only when retrying that exact
  request.
- `X-Group-Revision`: the current decimal Group revision (`0` for creation).
- `X-Access-Identity-ID`: required when creating a Group; it must identify an
  Access Identity already linked to the Account.

Successful workspace mutations return the next revision in
`X-Group-Revision`. A `409` response means the caller must load the current
workspace before deciding how to proceed; it is not safe to overwrite it
blindly.

Account Person mutations use `X-Mutation-ID` and `X-Person-Revision` in the
same way. Successful responses expose the next Person revision in
`X-Person-Revision`.

## Representation conventions

- Money is represented in the currency's smallest unit, never as a binary
  floating-point value. Expense amounts are JSON integers. Settlement amounts
  are decimal strings because the supported PostgreSQL range exceeds
  JavaScript's safe-integer range.
- Dates use `YYYY-MM-DD` and do not imply a time zone.
- IDs are client-generated UUID v4 values unless an endpoint description says
  otherwise.
- JSON success responses generally use a top-level `data` member. Validation
  failures use Laravel's `message` and `errors` members.
- API responses are `Cache-Control: no-store`. Requests with an `Origin`
  header are accepted only for configured origins.

## Scope and limitations

The description covers the application routes returned by Laravel's route
registry, including health/readiness endpoints. Laravel's development-only
storage routes are intentionally excluded because they are framework plumbing,
not part of JoinSplit's application API.

The OpenAPI file is documentation, not generated server code. Laravel routes,
Form Requests, middleware, Resources and Feature tests remain authoritative for
runtime behavior. When an API contract changes, update the implementation,
tests and `openapi.json` together.

## Verification

From the repository root, the lightweight contract checks are:

```sh
cd backend
composer test -- --filter OpenApiContractTest
php artisan route:list --json
composer test
```

The focused test parses JSON without an OpenAPI package, compares documented
methods and paths with Laravel's route registry, resolves local references, and
checks the authentication and mutation-header boundaries. The full Pest suite
verifies runtime authentication, validation, persistence, authorization and
idempotency behavior; a structurally valid description alone does not prove
those contracts.

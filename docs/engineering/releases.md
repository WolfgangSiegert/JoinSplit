# Versioning and release management

## Scope

JoinSplit is one deployable application assembled from the `frontend/` and
`backend/` directories. It therefore has one product version rather than
independent npm and Composer package versions. Neither directory is published
as a package.

The immutable Git tag is the authoritative released version. `version.txt` and
`.release-please-manifest.json` mirror the last version only as Release Please
automation state; application runtime behavior must not depend on either file.
A commit without a matching release tag remains an unreleased revision.

## Version format

Releases use [Semantic Versioning](https://semver.org/) and tags in the form
`vMAJOR.MINOR.PATCH`:

- `MAJOR` for an intentionally incompatible public contract change,
- `MINOR` for backward-compatible user-visible capability,
- `PATCH` for backward-compatible fixes and internal improvements,
- prerelease identifiers such as `-beta.2` while the public beta boundary
  remains in force.

During beta, Release Please uses the prerelease strategy and proposes the next
`beta` iteration. A deliberately different release boundary can be requested by
adding `Release-As: 0.2.0-beta.1` (with the intended version) to a Conventional
Commit body. SemVer communicates release sequence; it does not create a
production-readiness or support claim.

## Why Release Please

The previous repository script generated a read-only Markdown artifact but did
not update `CHANGELOG.md`. A workflow that writes directly back to `main` would
bypass normal review and can recursively trigger itself. Release Please instead
maintains a normal release pull request. This adds one GitHub Action dependency
but no frontend or backend runtime dependency.

The workflow uses `googleapis/release-please-action@v5.0.0`. Updating that action
requires the same dependency review as another CI action: inspect its release
notes, update the explicit version and verify the release pull request behavior.

## Conventional Commit contract

Commits reaching `main` must use a meaningful Conventional Commit subject:

```text
feat: add settlement export
fix(sync): preserve pending local groups
docs: explain account adoption
test: cover offline retry
refactor: isolate balance formatting
chore: update release configuration
```

Release Please derives the changelog sections from `release-please-config.json`.
The supported visible types are `feat`, `fix`, `perf`, `refactor`, `docs`,
`test`, `build`, `ci`, `chore` and `revert`. A breaking change uses `!` or a
`BREAKING CHANGE:` footer. Use squash merging so the final PR commit is the
reviewed changelog unit; intermediate branch commits should not leak into the
published history.

Do not use a vague subject such as `update files`. Correct the squash commit
subject before merging. Release Please ignores non-Conventional subjects or may
produce incomplete notes from them.

## Automated lifecycle

1. A Conventional Commit is pushed or squash-merged to `main`.
2. the **Release Please** workflow opens or updates one release pull request,
3. that PR updates `CHANGELOG.md`, `version.txt` and
   `.release-please-manifest.json`,
4. CI validates the release PR like any other pull request,
5. the release operator reviews its version and generated notes,
6. merging the release PR is the explicit human publication approval,
7. the next Release Please run creates the matching `v...` tag and GitHub
   prerelease from the merged changelog entry.

Release Please does not deploy Render, run production migrations or publish
native-store builds. Production deployment remains a separate manual approval
under the deployment runbook.

Do not manually create the tag or GitHub Release for a Release Please-managed
version. Competing manual and automated release paths can produce duplicate or
misaligned release state.

## One-time GitHub setup

Create a fine-grained personal access token for this repository and save it as
the Actions repository secret `RELEASE_PLEASE_TOKEN`. Grant only the permissions
needed by the workflow:

- repository metadata: read,
- contents: read and write,
- pull requests: read and write,
- issues: read and write, for Release Please labels.

A dedicated token is used instead of the default `GITHUB_TOKEN` because pull
requests created by the default token do not trigger the normal CI workflow.
Rotate or revoke this credential like any other publishing credential.

In **Settings → Actions → General**:

1. allow the Release Please action,
2. allow Actions to create pull requests,
3. ensure the workflow can receive the declared write permissions.

In the repository pull-request and `main` ruleset settings:

1. allow squash merging and use it for contributions to `main`,
2. require pull requests instead of direct pushes to `main`,
3. require the **CI / conventional-pull-request-title** and **CI / verify**
   checks before merging.

The lightweight title check requires the pull-request title to follow the
Conventional Commit shape. With squash merging, that reviewed title becomes the
single commit subject that Release Please reads. Merge commits or rebase merges
can preserve unrelated intermediate subjects and therefore weaken the generated
changelog.

If a `main` ruleset requires CI, do not bypass it for the release PR. The token
owner must be allowed to create the automation branch and PR, but merging remains
subject to the normal checks and human approval.

## Setup and smoke test

Before pushing the setup, validate the checked-in configuration locally:

```sh
python3 -m json.tool release-please-config.json >/dev/null
python3 -m json.tool .release-please-manifest.json >/dev/null
test "$(python3 -c 'import json; print(json.load(open(".release-please-manifest.json"))["."])')" = "$(tr -d '\n' < version.txt)"
git diff --check
```

After the setup commit reaches `main`:

1. open **Actions → Release Please** and verify a successful run,
2. confirm that exactly one release PR exists,
3. confirm that it contains only generated changes to `CHANGELOG.md`,
   `version.txt` and `.release-please-manifest.json`,
4. verify that the accumulated post-`v0.1.0-beta.1` Conventional Commits appear
   under the configured headings,
5. verify that both ordinary CI checks run and pass on that PR,
6. do **not** merge it merely as a test.

The workflow also supports `workflow_dispatch`, so rerunning it manually is safe:
it updates the existing release PR rather than publishing a release. The actual
end-to-end tag and GitHub Release test should be the first approved release, not
a disposable fake version.

## Release procedure

1. Confirm the release PR targets the intended `main` commit and CI is green.
2. Review the proposed version, changelog categories, compare links, migration
   notes and known limitations.
3. If a different version is required, add an approved Conventional Commit with
   a `Release-As: ...` footer and let the workflow update the PR. Do not manually
   edit the manifest or generated version section to fight the automation.
4. Merge the release PR only after explicit publication approval.
5. Verify the next Release Please run created exactly one matching tag and
   GitHub prerelease.
6. If production deployment is separately approved, deploy that tag's exact
   commit using [`deployment-runbook.md`](deployment-runbook.md).

If publication fails after the release PR is merged, pause and diagnose before
creating tags manually. Never move or reuse a published tag. Correct release
metadata where sufficient, or issue a new patch/prerelease version.

## Changelog and retrospective history

Release Please owns new version sections in `CHANGELOG.md`; do not maintain a
parallel hand-written `Unreleased` section. GitHub Releases publish the same
generated version notes. `docs/releases/version-history.md` preserves the
retrospective pre-automation milestone history and must not pretend that an
untagged milestone was a released version.

For a milestone that needs evidence beyond generated notes, add a concise file
under `docs/releases/` containing:

- version and release date,
- user-visible scope and known limitations,
- exact commit and successful CI run,
- migration or compatibility notes,
- production deploy identifier and smoke-check result, if deployed.

Release records must not contain secrets, real user data or full provider logs.

# Versioning and release management

## Scope

JoinSplit is one deployable application assembled from the `frontend/` and
`backend/` directories. It therefore has one product version rather than
independent npm and Composer package versions. Neither directory is published
as a package.

The Git tag is the authoritative version. Source files deliberately do not
duplicate it. A checked-out commit without a matching release tag is an
unreleased revision.

## Version format

Releases use [Semantic Versioning](https://semver.org/) and tags in the form
`vMAJOR.MINOR.PATCH`:

- `MAJOR` for an intentionally incompatible public contract change,
- `MINOR` for backward-compatible user-visible capability,
- `PATCH` for backward-compatible fixes and internal improvements,
- prerelease identifiers such as `-beta.2` while the public beta boundary
  remains in force.

During beta, versions normally remain below `1.0.0`. SemVer communicates the
release sequence; it does not turn the showcase into a production-readiness or
support claim.

## Changelog automation

GitHub Releases are the canonical published changelog. GitHub can generate each
release's notes from the preceding tag. `.github/release.yml` groups labelled
pull requests; unlabelled pull requests and direct commits still appear in the
generated notes but may be less precisely categorised.

The read-only **Release notes** workflow prepares a Markdown artifact for human
review. It can preview any proposed SemVer release from GitHub Actions and also
runs automatically after a matching version tag is pushed. It never creates a
tag, GitHub Release or deployment. The same output can be checked locally:

```sh
bash .github/scripts/generate-release-notes.sh 0.2.0-beta.1 main
```

`CHANGELOG.md` is a stable entry point to the release history and the curated
record for the first beta. Do not copy generated notes into a second manually
maintained history.

Use conventional commit subjects (`feat:`, `fix:`, `docs:`, `test:`,
`refactor:`, `chore:`) so direct-commit notes remain readable. Add the
`skip-changelog` label only to pull requests that have no user or operator
value in release notes.

## Release procedure

Tag creation, GitHub Release publication and production deployment are three
separate external changes. Each requires explicit human approval. A tag or
GitHub Release does not deploy Render or change database state.

1. Decide the SemVer version from the changes since the latest tag:
   `git log --oneline $(git describe --tags --abbrev=0)..main`.
2. Confirm the intended commit is the current `main` commit and its `CI`
   workflow completed successfully.
3. In GitHub Actions, run **Release notes** with the proposed version and
   `main`. Download and review its Markdown artifact.
4. After explicit approval, create the annotated tag on the approved commit and
   push only that tag:

   ```sh
   git tag -a v0.2.0-beta.1 <approved-commit> -m "JoinSplit v0.2.0-beta.1"
   git push origin v0.2.0-beta.1
   ```

5. After separate approval, create a GitHub Release for that existing tag.
   Choose **Generate release notes** so `.github/release.yml` is applied, then
   reconcile the result with the reviewed artifact. Mark beta versions as a
   prerelease.
6. Review title, notes, compare link and prerelease status. Edit wording only to
   clarify product impact, migration requirements or known limitations; do not
   rewrite history to hide material changes.
7. If production deployment is approved separately, follow
   [the deployment runbook](deployment-runbook.md) for the tag's exact commit
   and record the Render deploy evidence.

If any step fails, fix the cause before continuing. Do not move or reuse a
published tag silently. If an incorrect release is already public, pause and
decide explicitly whether to correct only its metadata or issue a new
patch/prerelease version.

## Release record

For milestones that need evidence beyond generated notes, add a concise file
under `docs/releases/` containing:

- version and release date,
- user-visible scope and known limitations,
- exact commit and successful CI run,
- migration or compatibility notes,
- production deploy identifier and smoke-check result, if deployed.

Release records must not contain secrets, real user data or full provider logs.

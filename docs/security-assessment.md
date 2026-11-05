# API security assessment — 2026-11-05

Scope: `nutrino/api` master, starting at
`33926b9a16dd0ca3e341d527e8a1527c923e95f0`. No production server, database,
credentials, firewall or TLS configuration was changed during this review.

## Changes

| Finding                                                                                                                                 | Change and regression coverage                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bunyan's default request/error serializers retain request URLs, headers and error values. Sync IDs in URLs grant read/write access.     | Whitelist the HTTP method and error name. An actual Bunyan output test verifies that IDs, authorization, cookies, bodies and error messages are omitted.                                                                                                     |
| Enabling `trust proxy` trusted the entire forwarding chain, permitting forged client addresses when a proxy appends forwarding headers. | Trust only loopback by default, or explicit `server.trustedProxies` addresses/CIDRs. HTTP tests verify a forged prefix is ignored and untrusted peers cannot supply forwarded client addresses.                                                              |
| Bookmark/version/timestamp fields reached the service without runtime type validation.                                                  | Reject non-string bookmarks, malformed/overlong versions and invalid/noncanonical timestamps with HTTP 400 before any write. Opaque encrypted bookmark strings and optional legacy fields remain supported.                                                  |
| v2 update conflict checking used a read followed by an unconditional write.                                                             | Include the observed `lastUpdated` in the update filter and return 409 when it no longer matches. Advance timestamps by at least one millisecond. A real MongoDB race test verifies exactly one of two writes succeeds and the winning payload is preserved. |
| Body parsing happened before throttling; malformed JSON returned a generic 500.                                                         | Rate-limit before JSON parsing and return a sanitized 400 for malformed JSON. HTTP tests cover throttling, size limits and response redaction.                                                                                                               |
| The HTTP/HTTPS listener ignored `server.host` and bound every interface.                                                                | Honor the configured host, with loopback fallback. Both listener tests verify the bind address.                                                                                                                                                              |
| Old dependencies contained published vulnerabilities and Node Sass prevented safe current-Node builds.                                  | Update Express 4, DOMPurify, Marked, Mongoose/MongoDB, UUID, Moment and build/test tooling; replace Node Sass with Dart Sass and remove Coveralls' obsolete request dependency. Use the committed npm lock and installation without lifecycle scripts.       |
| `deepmerge` has an unresolved prototype-poisoning advisory.                                                                             | Remove it from runtime settings merging and ignore prototype keys recursively. Keep a regression test. Do not downgrade or suppress audit advisories merely to obtain a clean report.                                                                        |

Mongoose remains on the patched 6.13 line to avoid unverified database-server
compatibility changes. Removed connection options are obsolete in Mongoose 6.
Binary subtype-4 sync IDs, collection names, encrypted payloads and client API
version 1.1.13 are preserved. There is no database migration.

Settings arrays now replace default arrays rather than concatenate with them.
Nested scalar defaults remain intact, and prototype keys are ignored.

## Validation

On macOS arm64 with Node 22.22.0 and an isolated MongoDB 7.0.28 bound to
127.0.0.1, run:

```sh
npm ci --ignore-scripts
npm run build
npm test
npm audit --omit=dev --audit-level=low
npm audit
```

The build includes TypeScript, ESLint, SCSS lint and production documentation
bundling. Existing unused-variable/decorator warnings remain. The GitHub Actions
workflow runs the build, unit/HTTP tests, MongoDB integration tests and production
dependency audit on Node 22/MongoDB 7 and Node 24/MongoDB 4.4.1 for compatibility
coverage. The workflow has read-only repository permissions.

Local results: clean `npm ci --ignore-scripts` and `npm run build` passed;
`npm test` passed 224 unit/HTTP tests across 18 suites and 24 real-MongoDB
integration tests across four suites.

Baseline audit: 126 findings (11 low, 51 moderate, 49 high, 15 critical).
Updated production dependency audit: zero findings. Full dependency audit: seven
low findings, all from Jest's transitive `deepmerge` and its dependency parents.
The advisory has no upstream patched release. These development dependencies
must not be included in the final production runtime installation. A dependency
audit is not proof that every application or deployment vulnerability is absent.

References: [Express proxy trust](https://expressjs.com/en/guide/behind-proxies.html),
[Mongoose 6 migration](https://mongoosejs.com/docs/migrating_to_6.html),
[deepmerge advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).

## Deployment status and preflight

Operational deployment evidence belongs in private release records rather than
this public source repository. Record the verified target, current revision,
launcher, runtime versions, artifact checksums and rollback directory there.
Preserve existing process environment credentials without printing or saving
them. Prepare the replacement release separately and retain the prior release.

Because the old listener ignored `server.host`, explicitly reconcile the new
bind setting with the existing effective listener before switching releases.
Preserve the intended external reachability; do not infer it from the old
configuration value alone.

Before applying the release through the existing deployment procedure:

1. Verify the instance and application directory, current remote/branch/revision,
   service manager and health URL. Record the currently running revision and
   release artifacts as the rollback target; it is not necessarily the baseline
   source commit above.
2. Check Node >=22.15, the actual MongoDB server version, existing API credentials
   and the reverse-proxy network path. This review tested MongoDB 7.0.28; the
   production database version must be checked separately. Do not run the
   integration tests against production: they delete test collections.
3. Verify `server.host` is reachable by the existing proxy. A local proxy can use
   127.0.0.1. A container may require an explicit `0.0.0.0` bind with the existing
   restricted port exposure. Verify `trustedProxies` matches the actual proxy
   addresses. Preserve `config/settings.json`, environment credentials, database
   files, TLS keys/certificates and existing backup arrangements.
4. Deploy the exact pushed commit only after its CI passes, using the established
   process. Build with development dependencies, then install only production
   dependencies for runtime, e.g. `npm ci --omit=dev --ignore-scripts`, where the
   established release layout supports this. Do not change database users,
   firewall rules, credentials or TLS settings as an implicit part of this patch.
5. Verify the service/container is healthy, its release manifest or checkout
   matches the pushed SHA, and HTTPS `/info` and documentation respond correctly.
   `/info` reports the protocol version, not the Git SHA. Do not infer the deployed
   SHA from that version. Use a dedicated test sync for any write smoke test.

Rollback: restore the recorded prior application release/artifact and its
matching runtime dependencies, preserving production settings, credentials and
database data, then restart through the same service manager and repeat health
checks. No schema or data rollback is required by these changes.

## Remaining boundaries

The protocol uses an unguessable sync ID as a bearer capability and encrypts data
in the client. This patch does not add account authentication, server-side
password checking, ownership ACLs or a new encryption format. Protect sync IDs
and TLS; possession of an ID still permits replacing its ciphertext. Legacy v1
updates and v2 clients that omit `lastUpdated` retain their existing unconditional
overwrite intent. CORS remains a browser policy, not an authorization control.

The daily new-sync quota and global sync count are check-then-create operations,
so concurrent creation can exceed those soft limits. HTTP throttling mitigates
abuse but is in-memory per process and is not a hard distributed quota. Atomic
distributed allocation would require a separate storage/protocol design.

Production TLS, MongoDB authentication/network exposure, infrastructure patches,
backups and retained historical logs have not been inspected. Previously logged
IDs may remain in old logs; log retention or credential changes require a
separate verified operational action. Keep monitoring dependency advisories,
including the remaining development-only `deepmerge` advisory.

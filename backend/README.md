# Quick Calories backend setup for the coding agent

## Start here

The backend is already provisioned. Build the application in your checkout of
`https://github.com/CzarSimon/quick-calories`; do not create another project.
Read `../IDEA.md` for the React Native / Expo product direction. The owner wants to
discuss data structure and core concepts before settling the schema; the brief's
examples are not a finalized data model.

Hosting is managed by [pocketbase-paas](https://github.com/CzarSimon/pocketbase-paas).
Clone that repository separately if you have access, and set `PBPAAS_REPO` to
its absolute checkout path. No path on the owner’s Mac is required for development.
Before production work, read these files in that repository:

- `docs/agent-guide.md`: ownership and integration contract.
- `docs/handoff.md`: host, access, current inventory and operational status.
- `docs/app-deployment.md`: initial app deployment.
- `docs/authentication.md`: native authentication and authorization.
- `docs/app-upgrades.md`: subsequent additive releases and app-owned probes.
- `docs/local-development.md`: local workflow and production differences.

The local-development guide contains older version and upgrade statements. For
this project use **0.40.4**, and follow `app-upgrades.md` for subsequent releases.
Reinspect production before deployment in case the runtime or release has changed.

## Working from a remote agent environment

This handoff is self-contained for starting app development. The owner’s platform
checkout has operational documentation/tooling changes that may not yet be pushed;
a fresh platform clone may lack some referenced files or commands. Do not infer
that an older checkout matches the installed host tooling. If a required guide or
command is missing, request the matching platform revision or hand the tested app
commit to the owner/platform operator for packaging and deployment.

You do not need the owner’s SSH key, production superuser credentials or cloud
credentials to implement and test the app. Those are not included in this branch.
Without separately provisioned management access, complete local development,
commit the migrations/hooks and tests, and provide the source commit and test
results to the operator. Public backend access does not grant deployment access.
Do not create a replacement backend because SSH or platform repository access
is unavailable.

## Provisioned state, verified 2026-11-05

| Setting | Value |
| --- | --- |
| Project | `quick-calories` |
| Public backend URL | `https://quick-calories.pb.simonlilja.eu` |
| PocketBase runtime | `0.40.4` |
| Release | `platform-bootstrap-v1`; no application release yet |
| RAM / CPU ceiling | 128 MiB / 0.5 CPU |
| Disk admission reservation | 512 MiB; not an enforced filesystem quota |
| Backup data ceiling | 256 MiB including uploaded files |
| Backups | Encrypted, first remote backup verified; scheduled every 15 minutes |
| Authentication | Built-in `users` password auth enabled; signup closed |
| Email / OTP / OAuth | SMTP unconfigured; OTP and OAuth disabled |

`hosting.yaml` records the existing resource reservation; it does not deploy a
schema. Public HTTPS health passed and the public admin dashboard returned 403.
Satiety Scanner was archived to make room, with its data retained. Weight Logger
is a separate application and must not be modified by this app's work.

## Local development

Use vanilla upstream PocketBase **0.40.4**, matching the local OS and architecture.
The full PaaS stack and cloud credentials are unnecessary for app development.
Keep the binary, local data, auth state and credentials ignored by Git. Before
running locally, add suitable ignore entries for `.local/`, `/pocketbase` and
private environment files; keep a secret-free `.env.example` if useful.

From this repository, with the matching binary at `./pocketbase`:

```sh
mkdir -p backend/pb_migrations backend/pb_hooks .local/pb_data
./pocketbase serve --http=127.0.0.1:8090 \
  --dir=./.local/pb_data \
  --migrationsDir=./backend/pb_migrations \
  --hooksDir=./backend/pb_hooks
```

Use `http://127.0.0.1:8090/_/` for the local dashboard and create a separate local
superuser. Commit generated app migrations, never the local database. Test a clean
local database rebuilt from migrations before packaging.

Configure the Expo app with a public backend URL:

```dotenv
# Local development on a client that can reach the host loopback:
EXPO_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090
# Production builds instead use:
# EXPO_PUBLIC_POCKETBASE_URL=https://quick-calories.pb.simonlilja.eu
```

On a physical phone, loopback refers to the phone, not the development computer.
Use a deliberate development-only network/tunnel setup and a reachable URL for
that device; do not change production management access to solve local networking.
The backend URL is public configuration. Tokens and passwords are not.

## Implement the app-owned backend

Keep collections, access rules and migrations in `backend/pb_migrations/`, hooks
in `backend/pb_hooks/`, and app tests/probes in this repository. The platform repo
must not contain application schemas, hooks, frontend code, seed data or databases.

Use native PocketBase SDK or REST calls as ordinary users. Implement session
persistence suitable for React Native, auth refresh/expiry handling, and logout
that clears stored credentials. Never authenticate the mobile app as a superuser.
Enforce per-user ownership in collection rules, including referenced records and
files, rather than relying on filters in the client.

The initial migration must deliberately configure the chosen signup/auth contract.
Do not assume that signup is open. Do not add app collections or ordinary users
manually in production before the initial deployment: its empty-database gate
would reject that state. Preserve platform-managed superuser and server settings.

Email verification, password-reset email and OTP need a separately configured and
tested SMTP sender. OAuth needs provider setup. Do not present unconfigured flows
as working. Monitoring emails do not provide application email delivery.

Test anonymous denial, two-user record/file isolation, attempts to assign another
user's ownership or references, expired sessions, logout, and normal app workflows.
Test hooks under the 128 MiB RAM and 0.5 CPU limits. Production release files and
the container filesystem are read-only; persistent writes belong in the data
directory and temporary writes in `/tmp`.

## Prepare and deploy the initial app release

These are instructions for a future deployment, not commands already run.
First finish the agreed schema, test the complete app locally, commit the release
source, and verify that the migration/hook files exactly match that commit.
The packer records the supplied commit but does not verify Git provenance.

Migration names use ten-digit timestamps, such as `1900000000_initial.js`.
Hook entry points end in `.pb.js`; supported helper files end in `.js` or `.json`.
The packer accepts flat directories only, up to 128 files, 256 KiB per file and
1 MiB total. Do not include secrets or platform bootstrap migrations.

The following packaging and SSH commands are for an environment with the matching
platform tooling and authorized management access. Set `PBPAAS_REPO` to that
checkout’s absolute path. Use the platform CLI at `dist/cli/main.js`. If it needs rebuilding,
follow the platform repository's build instructions (`npm run build`); do not
replace the installed production tooling as part of ordinary app development.

From the app repository, package the committed source with the explicit runtime:

```sh
: "${PBPAAS_REPO:?Set PBPAAS_REPO to the matching platform checkout}"
mkdir -p .local/releases
release_commit=$(git rev-parse HEAD)
artifact="$PWD/.local/releases/quick-calories-$release_commit.json"
node "$PBPAAS_REPO/dist/cli/main.js" \
  release pack quick-calories --source "$PWD/backend" \
  --commit "$release_commit" --version 0.40.4 --output "$artifact"
```

The output file must not already exist. Use a new output path when appropriate;
do not overwrite a previously reviewed artifact.

The operator must set `PBPAAS_SSH_KEY` and `PBPAAS_KNOWN_HOSTS` to the absolute
paths of their authorized SSH private key and verified host-key file. Do not copy
the owner’s private key into the repository or agent chat. Expected ED25519 fingerprint:
`SHA256:H/ygtIUzcY/jHRAHqW+NAMhIdyqKQFrEiga4vSQY8rM`.
Do not bypass host-key validation. SSH source addresses must be allowlisted; if
access times out, follow the platform operations workflow.

```sh
: "${PBPAAS_SSH_KEY:?Set the authorized SSH key path}"
: "${PBPAAS_KNOWN_HOSTS:?Set the verified known_hosts path}"
ssh_opts=(-i "$PBPAAS_SSH_KEY"
  -o "UserKnownHostsFile=$PBPAAS_KNOWN_HOSTS"
  -o StrictHostKeyChecking=yes)
ssh "${ssh_opts[@]}" pbpaas@51.158.64.217 \
  'sudo pbpaas project inspect quick-calories; sudo pbpaas project auth-status quick-calories; sudo pbpaas doctor'
scp "${ssh_opts[@]}" "$artifact" \
  pbpaas@51.158.64.217:/home/pbpaas/quick-calories-release.json
ssh "${ssh_opts[@]}" pbpaas@51.158.64.217 \
  'sudo pbpaas project deploy quick-calories --artifact /home/pbpaas/quick-calories-release.json --dry-run'
# After reviewing the dry-run and completing the deployment prerequisites:
ssh "${ssh_opts[@]}" pbpaas@51.158.64.217 \
  'sudo pbpaas project deploy quick-calories --artifact /home/pbpaas/quick-calories-release.json'
```

The `ssh_opts` example uses zsh/bash array syntax. Initial deployment briefly
removes routing, validates the empty database, applies migrations, checks health,
and verifies an encrypted post-release backup before reopening routing. Dry-run
is an eligibility check, not a full migration rehearsal.

After deployment, inspect the release and backup status, run `project auth-status`
and `doctor`, verify public `/api/health`, and perform app-specific smoke tests
without exposing tokens or leaving test data in production. Record the source
commit, release ID, validation results and backup IDs in the app's release notes.
If deployment fails, follow the documented recovery procedure; do not delete locks
or deployment markers just to retry.

## Later changes and operations

For subsequent releases follow `docs/app-upgrades.md`, including its isolated
app-owned probe and completion/status checks. Preserve all previously deployed
migration filenames and bytes. The current upgrade gate permits additive changes
such as optional fields and new collections; it rejects changes to existing data,
fields, auth configuration and access rules. Decide the initial auth/ownership
model carefully. Runtime updates use the separate platform playbook, never an
image swap during app deployment.

Production dashboard access is through SSH:

```sh
ssh -t "${ssh_opts[@]}" pbpaas@51.158.64.217 \
  'sudo pbpaas project dashboard quick-calories'
```

Follow the helper's port-forward instructions. Read credentials only through the
private owner workflow and store them in a password manager, never chat, source,
logs, mobile configuration or release artifacts.

As of provisioning, application health, HTTPS and fresh backups passed, but overall
`doctor` still reported existing restore-drill, security-audit and pending-reboot
failures. A stale October 3 backup lock was recovered and scheduled backups resumed.
Recheck and coordinate those maintenance findings before a production app release;
do not assume the platform has an all-clear. Do not increase capacity, reboot the
shared host, or change another application's configuration as an app setup step.

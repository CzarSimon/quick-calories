# Initial backend release — 2026-11-09

- Source branch: `claude/modest-brown-lo8k28`.
- Source commit: `abb7317b086a33552884f7b7161748dfba4e08af`.
- Release: `app-aeb184bbd8262217f9e5dd731bcdf8d36fc69676ff5c7b2973acc7fb2430add8`.
- Runtime: PocketBase 0.40.4, unchanged.
- Endpoint: https://quick-calories.pb.simonlilja.eu.

Deployed the five committed migrations (`1762300000_auth.js` through
`1762300004_tracking.js`) using the platform initial-deployment command after a
successful dry-run and verified backup. The existing local artifact was checked
byte-for-byte against all five committed source files. No hooks or seed data were
included. The platform completed its empty-database, migration, security-setting,
health and post-release backup checks before reopening routing.

Validation: `npm run test:backend` passed 151 checks on local PocketBase 0.40.4,
including two-user isolation, relation ownership, closed signup, session handling,
and migration rollback/reapply. Live management checks verified all 13 application
collections, ownership rules, zero app records and zero ordinary users. Public
HTTPS health passed; all collection list endpoints returned no records anonymously,
and the dashboard returned 403. Signup remains closed; accounts must be created
through the operator's private management workflow. SMTP/OAuth/OTP remain unconfigured
or disabled. No production account or test records were created.

Preflight verified backup: `7307105c-7c7e-4c2e-81e5-40df39c19694`.
Post-release verified backup: `b35baa1d-06dd-49fa-8869-e1888155eb92`.

## Measured resource correction

The preflight backup exposed a recurring memory failure: Linux killed PocketBase
at the 128 MiB container limit. Empty failed-backup staging was preserved under
`/srv/pbpaas/state/backup-recovery-20261109/`, using the platform operation lock.
Quick Calories was increased to 256 MiB after admission validation; the combined
application allocation is now 512 MiB (256 each for Quick Calories and Weight
Logger), within the unchanged platform limit. A successful backup measured
210.67 MiB peak usage with zero OOM events in the recreated container. The app's
hosting manifest was updated to reflect the applied reservation.

The source migrations were not changed by this deployment. The unrelated local
untracked `pnpm-lock.yaml` was left untouched. Later schema changes must use the
platform's additive app-upgrade workflow and app-owned probe.

Host maintenance remains separate: the pre-existing security audit reports one
high npm dependency vulnerability and a pending reboot. Runtime updates and a
shared-host reboot were not performed as part of this release.

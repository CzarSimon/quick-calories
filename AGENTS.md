# Quick Calories agent entry point

Read `IDEA.md` for the product intent and `backend/README.md` for backend setup,
constraints and release commands before implementation. The product brief asks
for discussion of the data model and core concepts; treat its examples as proposals,
not an approved schema.

Use the existing `quick-calories` PocketBase backend. Keep all app code, schemas,
migrations, hooks and tests here. The `CzarSimon/pocketbase-paas` repository owns
hosting and operations only. Do not provision a duplicate backend.

Develop against local PocketBase 0.40.4 and deploy committed migration/hook
artifacts through the platform workflow. Never commit database files, local runtime
state, credentials or tokens. Never place superuser credentials in the app.

For a remote agent, the backend guide explains how to work without the owner’s
local paths or credentials and how to hand a tested release to the platform operator.

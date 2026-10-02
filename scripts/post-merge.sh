#!/bin/bash
set -euo pipefail
pnpm install --frozen-lockfile
# Full/partial Drizzle pushes can prompt for destructive rename decisions and
# swallow SQL errors. Apply only the reviewed, additive development prerequisite.
# Production schema remains managed by the Publish flow.
DEPLOYMENT_ENV=development pnpm --filter @workspace/api-server run setup:howto:development
pnpm --filter @workspace/api-server run migrate:howto

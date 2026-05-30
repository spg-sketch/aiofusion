# Bluhalo end-to-end test plan

Reusable, on-demand check that the full Bluhalo project data loads into the
intake form and the core demo flows run without errors. Run this before any
client demo or after changes to the intake, hub, optimise or accept logic.

## What it covers

1. Login with the admin account.
2. Create a fresh project named "Bluhalo Ltd".
3. Load the complete Bluhalo intake dataset (`bluhalo-intake.fixture.json`) into
   the active project's intake storage, then reload.
4. Confirm every PR Set-Up and AIO Set-Up section renders the Bluhalo answers,
   including the conditional follow-up fields (5.1b, 5.4b, 6.4b, 6.5b).
5. Exercise the per-question Optimise and Reject controls on an optimisable field.
6. Accept the intake and confirm it is signed off.
7. Visit the other main pages (Planner, LLM check, Press release) and confirm
   they render.
8. Throughout, confirm there are no uncaught console errors.

## Credentials

- Username: `admin`
- Password: `K9mt-4Rxq-7NzPv2`

## Data notes

- The dataset lives in `bluhalo-intake.fixture.json` next to this file. Keep the
  two in sync if fields change.
- A few technical fields (registered company number and address in 6.1, phone in
  6.2) are illustrative placeholders for testing only, not real registry data.
- The five optimisable fields are 1.1, 1.2, 1.3, 1.6 and 2.4. Optimise replaces
  these with the built-in mock copy, so the test only needs to trigger it on one.

## Storage shape (for reference)

- Active project id key: `aio.activeProjectId`
- Intake key: `aio.intake.v2` for the default project, otherwise
  `aio.intake.v2::{projectId}`
- The dataset object mirrors that intake value exactly: `formData`, `duals`,
  `dualLists`, `spokespeople`, `businessCategories`, `audienceCategories`,
  `intakeStatus`, `acceptedAt`, `optimisedFields`, `aiWebsite`.

## How to run

Ask the agent to "run the Bluhalo end-to-end test". The agent loads the fixture,
injects it into the active project's intake key via the browser, and drives the
flows above using the testing tool.

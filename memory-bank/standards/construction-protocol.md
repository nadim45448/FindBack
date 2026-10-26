---
standard: construction-protocol
status: approved
created: 2026-10-25T10:40:00Z
updated: 2026-10-25T10:40:00Z
depends_on: [tech-stack, data-stack, coding-standards]
intent: 001-findback-lost-and-found
---

# Construction Protocol

> **Owner-mandated 2026-10-25.** Construction for FindBack runs one step at a
> time. Each step is verified locally, reported, and then held for explicit
> owner confirmation before the next step begins. This protocol supplements the
> SpecsMD bolt stage checkpoints — it does not replace them. Where the two
> overlap, the stricter reading applies.

The always-on copy for the agent harness lives at the workspace root in
`puku.md`. This file is the durable, harness-independent record of the same
rule.

## Why

The owner wants to inspect and click through every increment of FindBack before
the next one is built. A bolt that completes five stages unattended produces a
large diff whose correctness is hard to judge in one sitting. One step per turn
keeps each review small enough to actually verify.

## Step granularity

A **step** is one stage of the current bolt, as defined by the bolt type file
(`.specsmd/aidlc/templates/construction/bolt-types/<bolt_type>.md`). Read that
file at the start of every bolt; never assume the stage list.

| Bolt type | Steps |
|---|---|
| `ddd-construction-bolt` | 1 Domain Model → 2 Technical Design → 3 ADR Analysis → 4 Implement → 5 Test |
| `simple-construction-bolt` | 1 Plan → 2 Implement → 3 Test |

**Step 0 — local environment bootstrap (once, before the first bolt).** The app
must actually start with `npm run dev` against a local PostgreSQL before any
bolt work begins. See "Local verification environment" below.

## The loop

1. **Complete** the work for this step only. Do not begin the next step.
2. **Verify.**
   - Run the project's real checks for what was touched — `npm run lint`,
     `npm test`, `npm run build` — using the scripts that actually exist.
   - After an **Implement** or **Test** step, **start the app locally and
     smoke-test the behaviour this step added**, not merely the homepage.
   - After an **artifact-only** step (Domain Model, Technical Design, ADR
     Analysis) there is nothing to run. Say so plainly. Never imply a run
     happened when it did not.
3. **Report** what changed, what was verified, and the output actually observed.
   If a check failed, say so and show the failure. If the app would not start,
   say so and show why — do not report the step as done.
4. **STOP.** Wait for owner confirmation before starting the next step.

## Local verification environment

Prerequisites confirmed available on this host on 2026-10-25:

| Requirement | Status | Notes |
|---|---|---|
| Node.js | ✅ v24.19.0 | |
| npm | ✅ 11.17.0 | Registry reachable — `npm ping` returned PONG |
| Docker | ✅ running | `postgres:16-alpine` image pulled successfully |
| PostgreSQL | ⚠️ host cluster exists but is **not usable** by this user | Role `bs01657` does not exist; `postgres` superuser requires a password we do not have; `sudo` needs a password. **Use a Docker Postgres container instead.** |

**Decision:** run PostgreSQL as a Docker container for local development. The
host cluster at `/var/run/postgresql:5432` is not accessible as `bs01657` and
must not be repurposed.

The local environment must be reproducible from the repository, so the container
definition and the environment variables live in the repo (a compose file and
`.env.example`), not in shell history.

## Leaving the dev server running

The owner wants to click through each change personally. After an Implement or
Test step, **leave `npm run dev` running** and report:

- the URL,
- that the server is still up,
- how to stop it — `kill <pid>` or `pkill -f "next dev"`.

This is a deliberate, owner-requested exception to the default habit of stopping
background processes before ending a turn. Stop the server when the owner asks,
or when the work is finished.

## Paths that cannot be manually tested locally

Two behaviours need services that are not available locally:

| Path | Why | Verification |
|---|---|---|
| Vercel Blob image upload and delivery | Requires a real Blob token and a private store | Automated tests plus explicit statement that it was not click-tested |
| Outbound email | Requires an email provider | Automated tests plus explicit statement that it was not click-tested |

For these: verify by automated test, state plainly in the report that the path
was **not** manually click-tested locally and why, and list exactly what would
be needed to test it for real. Never silently skip them, and never claim they
work.

## Never

- Never implement two steps in one turn.
- Never proceed past a step without explicit owner confirmation.
- Never claim a check passed that was not run.
- Never widen scope beyond the frozen PRD, the UX spines, and the requirements.
- Never add a paid service. The $0 ceiling is hard.

## Decision record

| ID | Decision | Date |
|---|---|---|
| CP-1 | One bolt stage per turn, with owner confirmation between stages | 2026-10-25 |
| CP-2 | Local verification uses a Docker PostgreSQL container, not the host cluster | 2026-10-25 |
| CP-3 | The dev server is left running after Implement/Test steps for owner inspection | 2026-10-25 |
| CP-4 | Blob and email paths are verified by automated test only, and reported as such | 2026-10-25 |

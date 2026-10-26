# FindBack — Agent Rules

## Construction runs one step at a time, with local verification

**Never** begin the next step before the user has confirmed the current one.

### What a "step" is

- **Step 0 (once, before the first bolt):** Local environment bootstrap — the
  walking skeleton. The app must actually start with `npm run dev` against a
  local PostgreSQL before any bolt work begins.
- **Every other step:** exactly one **stage** of the current bolt, as defined by
  the bolt type file
  (`.specsmd/aidlc/templates/construction/bolt-types/<bolt_type>.md`).

  | Bolt type                  | Steps in order                                                              |
  | -------------------------- | --------------------------------------------------------------------------- |
  | `ddd-construction-bolt`    | 1 Domain Model → 2 Technical Design → 3 ADR Analysis → 4 Implement → 5 Test |
  | `simple-construction-bolt` | 1 Plan → 2 Implement → 3 Test                                               |

  Read the bolt type file at the start of every bolt. Never assume the stage list.

### The loop — repeat for every step

1. **Complete** the work for this step only. Do not start the next step.
2. **Verify** it.
   - Run the project's real checks for what you touched (`npm run lint`,
     `npm test`, `npm run build` — use the scripts that exist).
   - If the step produced runnable code (Implement, and Test), **start the app
     locally and smoke-test it**:
     ```bash
     npm run dev          # background
     curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/<affected-route>
     ```
     Exercise the specific behaviour this step added — not just the homepage.
   - If the step produced only an artifact (Domain Model, Technical Design, ADR
     Analysis), there is nothing to run. Say that plainly. Never imply a run
     happened when it did not.
3. **Report** what you changed, what you verified, and the exact output you saw.
   If a check failed, say so and show the failure. If the app would not start,
   say so and show why — do not report the step as done.
4. **STOP.** Wait for the user to confirm before starting the next step.

### Leaving the dev server up

The user wants to click through the change themselves, so **leave `npm run dev`
running** after an Implement or Test step, and tell them:

- the URL,
- that the server is still up,
- how to stop it (`kill <pid>`, or `pkill -f "next dev"`).

This is a deliberate exception to the usual "stop background processes before
ending the turn" habit. Do it knowingly.

### When local verification is not possible

Some behaviour cannot be exercised by hand locally — Vercel Blob image upload and
delivery need a Blob token, and outbound email needs a provider. For those
paths: verify by automated test, state plainly in the report that the path was
**not** manually click-tested locally and why, and list exactly what would be
needed to test it for real. Do not silently skip them, and do not claim they
work.

## Never

- Never implement two steps in one turn.
- Never proceed past a step without the user's explicit confirmation.
- Never claim a check passed that was not run.
- Never widen scope to "improve" the frozen PRD, the UX spines, or the
  requirements. The PRD is frozen and authoritative.
- Never add a paid service. The budget ceiling is a hard $0.

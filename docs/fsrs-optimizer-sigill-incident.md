# FSRS Optimizer SIGILL Incident

**Date:** 2026-04-10 / 2026-04-11
**Severity:** High — reproducible production outage on every review submission for affected users
**Status:** Mitigated by disabling the optimizer call path. Root cause is environmental and requires a medium-term decision.

---

## One-paragraph summary

Every `POST /reviews` in production was silently killing the entire Node.js process. The API (and MCP server, which shares the process) died within ~500ms of the request arriving, Docker restarted the container, the next study request hit a restarting backend and returned `502 Bad Gateway` (previously `503 Service Unavailable` when the container was fully down). After extensive red-herring chasing, the root cause turned out to be environmental: the prebuilt native binary of `@open-spaced-repetition/binding` (the Rust FSRS optimizer) requires CPU features (AVX2, FMA, BMI2) that the production host's 2013 CPU does not have. First call into `computeParameters` hit an unsupported instruction and the kernel delivered `SIGILL` (exit code 132). The mitigation is to disable the optimizer call path; default FSRS-5 parameters are used unchanged.

## User-visible symptoms

1. Study page loads normally, cards fetch correctly (`GET /study/due` → 200)
2. User rates a card (`POST /reviews` → 201, review saved to DB)
3. Web UI's React Query invalidation fires the next `GET /study/due` → **502 Bad Gateway**
4. Browser refresh "fixes" it for exactly one more review, then the cycle repeats
5. MCP clients see `"Anthropic proxy: MCP server connection lost"` for the same reason (MCP server runs in the same Node process and dies with the API)

Earlier in the investigation the same symptom manifested as 503 instead of 502; the transition happened because the container's restart timing changed as other factors moved around. 503 and 502 here were both surface effects of the same underlying process death.

## Root cause

### The kill

- **Exit code:** 132 = 128 + 4 = **SIGILL** ("Illegal Instruction")
- **Trigger:** first call to `computeParameters` from `@open-spaced-repetition/binding` after a `submitReview` crosses the optimizer trigger thresholds (`reviews_since_optimization >= 100 && total_reviews >= 500`)
- **Mechanism:** the prebuilt `@open-spaced-repetition/binding-linux-x64-gnu` `.node` file is compiled assuming a modern x86_64 CPU baseline (AVX2, FMA, BMI2 — all introduced in Intel Haswell, 2013). The first matrix op hits an instruction the CPU doesn't implement, the kernel delivers `SIGILL`, and Node.js dies instantly with no stderr, no panic output, no JS-level handler reachable. `process.on('uncaughtException')`, `process.on('unhandledRejection')`, `.catch`, and `try/catch` are all above this kill in the stack — none of them can catch it.

### The production host

Production runs on an **early-2013 15" MacBook Pro** with an **Intel Core i7-3740QM** (Ivy Bridge). `/proc/cpuinfo flags` show `sse sse2 sse4_1 sse4_2 avx` but **no** `avx2`, `fma`, `bmi`, or `bmi2`. That is the full list of relevant features — the CPU is twelve years old and predates the instructions the binary assumes.

### Why nothing was logged

Unlike a Rust `panic!`, which writes to stderr before calling `abort()` (→ SIGABRT, exit 134), SIGILL is a hardware trap delivered by the kernel directly to the process. No user-space code runs between "CPU rejects instruction" and "process dies." Nothing gets flushed. Docker log capture had zero signal to work with, which is why the investigation had to fall back to `docker events` + `docker inspect` to learn the exit code.

## Investigation timeline and what went wrong diagnostically

This was a multi-hour debugging session with several wrong turns. Documenting them because the mistakes are instructive.

1. **Initial symptom: MCP `submit_review` returning generic "Error occurred during tool execution"** from Claude's API. We assumed MCP-specific issue, started poking at the review-service optimizations in commit `4c1ca36e` (which had just consolidated 8 DB queries into a single CTE).

2. **First hypothesis: `setImmediate` fire-and-forget pattern.** The optimization commit had moved the optimizer trigger into a `setImmediate` callback. We theorized that synchronous throws inside `setImmediate` were bypassing the `.catch` and crashing the process via `uncaughtException`. Committed a fix reverting to an awaited try/catch (`b20f23bd`). **This fixed a real thing but not the production bug.**

3. **Second hypothesis: `fsrs-rs` panics on all-zero-delta FSRS items.** We reproduced an actual Rust panic locally on darwin-arm64 by force-triggering the optimizer with lowered thresholds. Got exact panic text: `"Invalid FSRS item: at least one review with delta_t > 0 is required"`. Wrote a filter in `fsrs-optimizer.ts` that skips cards with all-zero deltas, plus a regression test at `tests/src/workflows/25-fsrs-optimizer.test.ts`. Committed as `4df3b402`. **This also fixed a real latent bug but still not the production one.**

4. **Production still 502ing after the deploy.** User reported the issue had not changed. Colleague review correctly flagged: (a) we never verified production data met the optimizer thresholds in the first place — we'd been repro'ing a bug under artificial conditions, (b) the proposed `worker_threads` isolation would not actually isolate SIGABRT (threads share the OS process), (c) the React #418 hydration error folded into the report was unrelated.

5. **Pulled real production data.** `docker inspect` showed `RestartCount=5`, container was actually flapping. Logs showed `POST /reviews` requests with no matching response log lines — the process was dying synchronously during request handling. But **no panic trace in the logs at all** — which was inconsistent with the Rust panic theory.

6. **`docker events` caught a live die event:** `action=die exitCode=132 signal=`. Exit code 132 = SIGILL, not the SIGABRT (134) we'd been expecting from a Rust panic. This immediately ruled out the panic theory: Rust panics always print stderr before aborting, a SIGILL never does.

7. **CPU feature check** (`/proc/cpuinfo`) showed Ivy Bridge — no AVX2, no FMA, no BMI2. Root cause identified.

### Diagnostic mistakes worth learning from

- **Jumping from "I reproduced *a* crash that looks similar" to "this is the production crash" without verification.** The darwin-arm64 panic was real but it's a different CPU, different binary, different failure mode. Should have checked production data *before* designing fixes.
- **Deferring to "check production" and then not actually checking.** The user's colleague asked us to query the prod DB to verify `reviews_since_optimization` and `total_reviews` crossed the optimizer thresholds at all. We should have started there.
- **Proposing `worker_threads` as "isolation for a native crash."** Worker threads share the OS process. SIGABRT, SIGILL, and SIGSEGV from any thread kill the whole process. Only `child_process.fork` or a separate container is real isolation. The proposal was architecturally wrong.
- **Folding the React #418 hydration error into the report as a "secondary symptom."** It wasn't — that's an unrelated SSR/client mismatch. Muddled the narrative.
- **Grep'ing logs for `panic|abort|SIGABRT` and concluding "no crash" when the grep came up empty.** A SIGILL produces none of those strings. The right first step was `docker inspect` / `docker events` to get the actual exit code, not string-matching on what we *expected* the crash to look like.

## Why CI didn't catch this

Two independent reasons, either of which would have been sufficient:

1. **The optimizer code path was never exercised in integration tests.** It gates on `reviews_since_optimization >= 100 && totalReviews >= 500`. Test databases never accumulate that much data in a single run, so `optimizeUserParams` never executed in CI at all.
2. **CI runs on GitHub Actions Ubuntu runners**, whose CPUs are modern Intel Xeons with full AVX2/AVX-512 support. Even if the optimizer ran, it would have worked. SIGILL is environmental — it can only be observed on hardware that lacks the required instructions.

A regression test was added during the investigation (`tests/src/workflows/25-fsrs-optimizer.test.ts`) that *does* cross the thresholds and force-triggers the optimizer. It caught the Rust panic shape (the latent bug), but would not have caught SIGILL on the current infrastructure because CI runners have AVX2. To catch it we'd need to either test on CPU-constrained hardware or emulate with `qemu-user-static` or similar.

## Mitigation applied

**Commented-out the optimizer call in `core/src/services/review-service.ts`.** The counter increment (`reviews_since_optimization + 1`) remains in place so no state is lost, but `optimizeUserParams` is no longer invoked. Default FSRS-5 parameters are used, which is the same thing every LearnForge user got before the per-user optimizer was added.

The regression test is marked `it.skip` with a comment pointing here. The test code is valuable; it stays for when the optimizer is re-enabled.

**What users lose:** per-user parameter tuning. Over many reviews, FSRS can learn individual forgetting curves and slightly tighten or loosen intervals. The effect is marginal for most users and nonexistent for users with < 500 reviews.

**What users do not lose:** any scheduling functionality. `ts-fsrs` runs client-side of the optimizer and schedules with default weights just fine. Study sessions work identically.

## Long-term options (deferred decision)

Not blocking. Pick at leisure.

### Option A — Keep the optimizer disabled permanently

- **Cost:** none
- **Effect:** default FSRS-5 weights forever, no per-user tuning
- **When it's right:** if personal parameter optimization doesn't materially improve your scheduling experience, or if simplicity matters more than the marginal accuracy gain

### Option B — Rebuild the native module from source targeting Ivy Bridge

- **Cost:** add `rustup` + `cargo` to the `api/Dockerfile` builder stage, set `RUSTFLAGS="-C target-cpu=ivybridge"` (or disable specific features: `-C target-feature=-avx2,-fma,-bmi2`), rebuild `@open-spaced-repetition/binding` during image build
- **Risk:** some of `fsrs-rs`'s transitive Rust dependencies may hard-require AVX2 and refuse to compile under the older baseline. The ML/numerical crate ecosystem is aggressive about SIMD. Won't know for certain without trying.
- **Effect:** restores the optimizer on current hardware. Optimization runs on the same CPU that caused the SIGILL, so any future panic/crash would still take down the process unless combined with isolation (see Option D).
- **When it's right:** if you want to keep running on the MBP AND you want per-user optimization

### Option C — Migrate to a cloud VPS with a modern CPU

- **Cost:** a few Euros per month (Hetzner, DO, Scaleway, etc.) + a one-time migration of the Postgres volume and image files
- **Effect:** the existing prebuilt binary just works. Zero code changes. Bonus: better reliability and uptime than a laptop as a server.
- **When it's right:** if you're willing to trade no-cost self-hosted for low-cost cloud. This is arguably the cleanest long-term answer for a public-facing service.

### Option D — Process isolation for the optimizer

- **Cost:** moderate — ~80 lines for a `child_process.fork` based runner. Parent sends items via IPC, child runs `computeParameters`, child returns the result or exits non-zero, parent treats non-zero exit as a recoverable optimization failure and moves on.
- **Effect:** a future panic/SIGILL/SIGSEGV in the optimizer kills only the child, not the API. The API stays up. Does NOT fix the SIGILL itself — optimizer still never completes — but contains the damage.
- **When it's right:** as defense-in-depth *combined with* B or C. On its own it just means the optimizer fails silently on every review, which is functionally equivalent to Option A for more code.
- **Not:** `worker_threads`. Those share the OS process and don't isolate native crashes. Only subprocesses (or separate containers) are real isolation boundaries for native kill signals.

### Recommended sequencing if you want the optimizer back

1. Option C (host migration) solves this and most classes of related problems in one move. If you're open to paying for hosting, it's the cleanest answer.
2. If you want to stay on current hardware: Option B, tested carefully in a dev branch, with a clear fallback if Rust deps refuse to build. Pair with Option D so a future unknown-shape crash doesn't reopen this incident.
3. If you don't really need per-user optimization: Option A is fine forever.

## Lessons and follow-ups

### Diagnostic discipline

- **Read the exit code before theorizing about the kill.** `docker inspect` / `docker events` should be the first tool, not the last. "What signal killed the process" directly narrows the hypothesis space to one family.
- **Don't grep logs for expected error strings.** If the grep is empty, it doesn't mean "no error" — it means "no error matching my assumption." SIGILL/SIGSEGV/SIGKILL produce zero text output.
- **Verify the premise matches production data before designing fixes.** A local repro with artificially lowered thresholds is a sanity check, not a production diagnosis.
- **Bug reports and incident docs should clearly separate "what I reproduced" from "what the user reported" from "my hypothesis for why they're the same."** Conflating them is how we ended up shipping a filter fix for a bug that wasn't causing the outage.

### Code / infra follow-ups

- Keep the delta-filter fix in `fsrs-optimizer.ts` (`4df3b402`). It's a correct fix for a real latent bug on darwin-arm64 / any CPU where the prebuilt binary *doesn't* SIGILL first. When the optimizer is re-enabled, this is still necessary.
- Keep `tests/src/workflows/25-fsrs-optimizer.test.ts`. It documents the regression shape and will exercise the code path on CI (where CPUs have AVX2) as soon as the call site is re-enabled. Currently `skip`ped.
- If and when the optimizer is re-enabled, ship it with `child_process.fork` isolation in the same change. The history now shows two distinct native crash modes in this single addon; treat the addon as untrusted native code going forward.
- Consider a small integration test that runs on an Ivy-Bridge-class QEMU to catch binary/CPU compatibility regressions ahead of production deploys. Not cheap, but the only thing that would have caught this before users saw it.

## Commits involved

- `4c1ca36e` — "Optimize submitReview: 8 sequential DB queries → 2" — introduced the CTE consolidation. Fine in isolation, set the stage for the cascade because it kept the optimizer fire-and-forget.
- `b20f23bd` — "Fix submitReview: replace setImmediate fire-and-forget with awaited try/catch" — fixed a real but different issue. Harmless.
- `4df3b402` — "Filter all-zero-delta items from FSRS optimizer" — fixed a real latent Rust panic on darwin-arm64. Did not fix the production SIGILL. The filter is still correct and stays.
- *(this commit)* — disable optimizer call, skip regression test, add this incident report. Stops the production outage.

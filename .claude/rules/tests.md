---
description: The least every route, stream, state group, formula, component and page flow is tested with, which kind of test proves which thing, how a test is named and where a suite may run
paths:
  - "test/**"
  - "web/test/**"
  - "web/src/**/*.spec.ts"
  - "web/src/**/*.fixture.ts"
---

# Tests

The `tester` agent holds this file and the `reviewer` agent runs what it describes. `just test` runs `vitest` for the web and `go test ./...` for the service; `just walk` runs the browser walk; `just gate` is `just check`, `just test`, `just build` and `just vet`.

## Names

1. A Go test is the sentence it proves, in the words of the table: `TestAPlayerReadsACampaignOnlyOnceSeated`, `TestOnlyTheDungeonMasterDrawsMaps` (`test/go/access_test.go:129`, `:186`). Never `TestGetCampaign` or `TestCampaign2`.
2. A Go test file is the resource, `test/go/<resource>_test.go`; what crosses resources lives in `access_test.go`, streams in `stream_test.go`, the state groups in `state_test.go`.
3. A Go helper takes the verb of what it does through the api: `postCampaign`, `postCharacter`, `postResource`, `getFriends` (`test/go/access_test.go:97`).
4. A web test is `*.spec.ts`. A fixture is `*.fixture.ts` and never carries the test suffix (`web/test/reference.fixture.ts`).

## Which kind proves which thing

5. A Go test in `test/go/` proves what the service decides: who may and who may not reach a route, what a stream delivers to whom, that an import upserts by key, that a write changes what the next read answers. It calls the handler in process as Testy or as Pip through `call` (`test/go/access_test.go:50`), with no server and no browser.
6. A vitest spec proves what the web computes: the rules engine, the parser, the resolver, the bridge and the store under `web/src/lib/`, and the geometry, model and tools of nimap under `web/test/nimap/`. No network and no service.
7. The browser proves what has to be seen: that a page opens, that a flow can be driven end to end, that a control answers. `just walk` runs `web/test/walk.sh` against the running stack as the debug user, and a flow that has to be watched is driven with the `nimon` skill, whose stories and test files live under `.nimon/` when a project has them. This repo has none yet.
8. hurl proves the api as a client meets it over HTTP: the status, the envelope and the headers of a request against the running service. This repo has no hurl suite and no recipe for one; bookable_server and nimployer keep theirs in `test/hurl/`, one file per call or per documented flow, run by their `just test-hurl`. Until the user names the folder and the recipe here, what hurl would prove is proved by rule 5.
9. One thing is proved once, at the lowest kind that can prove it. An access rule is a Go test and is not walked again in the browser; a formula is a vitest spec and is not asserted again through a page; the browser asserts that the page shows the answer, never that the answer is right.

## The minimum

10. Every route: one Go test of who may reach it and one of who may not, in the same test when they share their setup.
11. Every write: that the next read answers the change, and that a reader without the claim does not see it.
12. Every stream: one test of what it delivers to whom and one of whom it refuses or leaves out (`test/go/stream_test.go:148`, `:176`).
13. Every state group: it is in `internal/qubo/state.json`, an import upserts by key, and a player exports only what their claims bind (`test/go/state_test.go:21`, `:133`, `:173`).
14. Every formula, scaling, pool and threshold of a system, and every new system: one vitest case with the numbers a player would check by hand.
15. Every nimap geometry and tool behaviour: one spec under `web/test/nimap/`.
16. Every pure function under `web/src/lib/` that a page depends on for a decision: one spec of the decision and one of its edge.
17. Every page: a line in `web/test/walk.sh` that it opens and shows what it is for. Every flow a player completes in more than one step is driven once in the browser before it is called done.
18. A fixed bug gets the test that would have caught it, named as the sentence that is now true.

## Where a suite runs

19. A suite never runs against a database that holds working data, and never against a deployed one. `test/go` reaches the database this checkout's `.env` names and skips when none answers (`test/go/access_test.go:31`, `:43`).
20. A test makes the rows it needs through the handlers and reads only those; it never depends on `database/state/local.ndjson` and never on a row another test made.
21. A spec that measures time runs alone: `web/test/nimap/tools/performance.spec.ts` runs after the rest, which the `test` script of `web/package.json` does. A timeout on a loaded machine is told from a failure by running the one spec again alone.

## Good and bad

22. Good: `TestAHiddenRollIsReadByTheDungeonMasterAlone` (`test/go/access_test.go:156`): one rule, both sides, in the words of the table.
23. Good: `TestTheChatStreamCarriesAHiddenRollToTheDungeonMasterAlone` (`test/go/stream_test.go:148`): the stream's version of the same rule, proving the event and not the row.
24. Bad: a test that asserts only 200 for the owner. It proves no rule; rule 10 wants the refusal too.
25. Bad: a row or a claim inserted by SQL to set a test up. The handler makes it, as a player would.
26. Bad: the same access rule asserted in Go, in hurl and in the browser. Rule 9.
27. Bad: a test changed until it passes. A failing test is read to its cause first; when the test was wrong, the change says why.

## Do and don't

28. Do write the test with the route, in the same branch, and run `just test`.
29. Do name what a test leaves unproved when the minimum cannot be met, and stop there.
30. Don't add a test recipe, a test folder or a test tool without the user naming it.
31. Don't skip, loosen or delete a test to get a gate clean.

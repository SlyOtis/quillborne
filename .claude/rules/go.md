---
description: How Go is written here, the names, the handler shape, what a route carries, the tests, with the file that shows each and what is refused
paths:
  - "internal/**"
  - "cmd/**"
  - "test/go/**"
---

# Go

The `go` agent holds this file. Who may read a row is `claimius.md`, a table's shape `sql.md`, the wire `data.md`, the cli `cli.md`.

## Names

1. A function starts with `Get`, `Post`, `Put` or `Delete`, lower case when it is not exported. Never `Find`, `List`, `Create`, `Save`, `Grant`, `Fetch` or `Build`.
2. Never `By` in a name; the parameters say what is looked up. Singular returns one, plural many: `GetCampaign`, `GetCampaigns`.
3. A handler is the verb and the resource of its route, the parent first: `PostCampaignPlayer`, `DeleteCampaignCharacter` (`internal/handler/routes.go:54`).
4. A request body is `Body<Thing>` (`internal/handler/campaign.go:22`), an object type `db.OBJECT_TYPE_<TABLE>` (`internal/db/models.go:11`), a state group `Group<Thing>` with `<Thing>Data` (`internal/state/monster.go:12`).
5. A name is the user's. A route, a column, a type, a field or an enum value is proposed and written only once the user has said it, and no suffix that is not already in the code is added.

## The patterns

6. A handler reads top to bottom as `PutCampaign` does (`internal/handler/campaign.go`): the actor from `ctx.Get("user_id")`, the path id through `uuid.Parse`, the body bound with `ctx.Bind` and checked inline, `rctx := ctx.Request().Context()`, the access call, the work inside `db.Instance().RunInTx` with `sdb.Write` for the audit, then the answer.
7. A body is a struct of pointer fields, so an absent field changes nothing; `putMonsterBody` applies the ones sent and names their columns (`internal/handler/monster.go:35`). A body that must tell an empty document from an absent one binds with `nimbody.Bind` (`PutAsset` in `internal/handler/file.go`).
8. Every answer leaves through nimbody's `respond`: `respond.JSON(ctx, status, data, count)`, `respond.Error`, `respond.NoContent`, and `respond.ErrorInternal` after `ctx.Logger().Errorf("<Handler>: %v", err)` (`GetCampaigns` in `internal/handler/campaign.go`). The envelope, paging and search are nimbody's and change there or not at all.
9. An error becomes its status where it happens, three ways. After `MutationAccess` and after `postWriter`, `sdb.ErrNotFound` is 404, `sdb.ErrNoAccess` is 403, and any other error is a fault: logged with `ctx.Logger().Errorf("<Handler>: %v", err)` and answered `respond.ErrorInternal(ctx)`. A row read answers 404 only for `sql.ErrNoRows`, and any other error is the same fault. A fault is never answered 403 or 404 (`GetSongs` in `internal/handler/campaign_part.go`; `claimius.md` 17).
10. Access is three calls: a list through `sdb.ObjectWhere` (`GetCampaigns` in `internal/handler/campaign.go`), one row through `sdb.Instance().MutationAccess` (`GetCampaign`), a create through `postWriter` and `postOwnerBinding` (`internal/handler/share.go`). Each maps its errors as rule 9 says. Which claim and which mask, and that the owner and the campaign of a row are its `sa_owner_id` alone, is `claimius.md`.
11. A dependency is wired once where the service starts, `db.Init`, `sdb.Init`, `broker.Init`, `storage.Init` (`cmd/main.go:85`), and reached as `db.Instance()`, `sdb.Instance()`, `broker.Instance()`. A call passes only what varies per request.
12. A sub resource handler wraps its root handler and never copies its logic.
13. A model names its table `bun:"table:<singular>"`, carries the claimius columns as `OwnerID`, `CreatedBy`, `CreatedAt`, `UpdatedAt` and a `bun.NullTime` `DeletedAt` with `soft_delete`, marks what the api composes `bun:"-"`, and is snake_case on the wire (`internal/db/models.go:52`). A model change is followed by `just gen-types`.
14. A write posts its event after it succeeds through `broker.Post`: a topic, a kind, an id and an op, never a row (`postVehicleEvents` in `internal/handler/vehicle.go`).
15. A route never moves alone: its line in `handler.PutRoutes` (`internal/handler/routes.go:9`), its verb in `internal/qubo/resources.go` (`:140`), its group in `internal/state/` whose import, delete and blobs call the handlers through `call` (`internal/state/monster.go:73`, `internal/state/state.go:224`), `internal/qubo/state.json` rewritten by `TestTheEmbeddedStateDocumentIsTheDefinitions`, and its records in `database/state/local.ndjson`.
16. Every route ships with a test of who may and who may not reach it, and every stream with one of what it delivers to whom. A test is named as the sentence it proves and calls the handler in process as Testy or as Pip through `call` (`test/go/access_test.go:50`, `:129`; `test/go/stream_test.go:148`).
17. The api is a contract: no route, parameter, body field, response field, status or enum value changes or is added unless the user named that exact change. A need is met first through what the api already has.
18. Every build, test and run is a recipe of the `justfile`: `just test`, `just vet`, `just gen-types`, `just qubo <args>`, `just gate`.

## Good and bad

19. Good: `GetCampaign` (`internal/handler/campaign.go`), the whole read in one function, each refusal and each fault mapped on the line it happens.
20. Good: `importMonster` (`internal/state/monster.go:73`), an import that makes its row by calling `POST /api/monster` as the record's owner, so the handler makes every claim.
21. Bad: a store or a client constructed in the argument list of a call, with the request context and the actor plumbed again at every call site. It is wired once, rule 11.
22. Bad: a helper that maps an error to a status for several handlers, or wraps the access call. The mapping is inline, rule 9.
23. Bad: a sibling of an existing function carrying `Strict`, `V2`, `New`, `Companion` or `Helper`, or a new file to hold a helper that pairs with an existing function. The existing function changes in place and every call site with it.
24. Bad: making a required field optional, or loosening a shared check, so a new path can be taken. The approach is wrong, not the constraint.
25. Bad: a row or a claim written by SQL for a test or a seed. A test calls the handler; a local row is a record in `database/state/local.ndjson`.
26. Bad: a model field `CampaignID`, a body or response field `campaign_id`, or a `Where("campaign_id = ?", ...)` naming the campaign beside `sa_owner_id`. The campaign of a row is its `OwnerID`, and the where is on `sa_owner_id` beside `sdb.ObjectWhere` (`claimius.md` 27 and 29).

## Do and don't

27. Do read the nearest handler that does the same thing before writing, and match its order, its messages and its statuses.
28. Do change code in place and carry a rename to every call site.
29. Do run `just gate` before the work is called done.
30. Don't write a comment.
31. Don't keep a fallback, a backwards compatible path or an old branch beside the new one.
32. Don't filter on access in Go; what `sdb.ObjectWhere` and `MutationAccess` answer is what the reader may see.
33. Don't hand roll a `go` command where a recipe exists.

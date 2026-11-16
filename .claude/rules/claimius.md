---
description: How claimius is built, the prophet and the disciple, how the middleware is used from Go, and what Quillborne does and never does with them
paths:
  - "internal/**"
  - "cmd/main.go"
  - "database/**"
  - "deploy/sauth/**"
---

# Claimius, Samna Auth and the middleware

The `claimius` agent holds this file. What each row at the table is bound to is `data.md` Claims decide every read and write; this file is the system under it. A path marked `mw:` is inside the pinned middleware, relative to `go list -m -f '{{.Dir}}' github.com/nimling/samna-auth-middleware/v2`; `database/migrate.yml` pins the same ref in its `Claimius Schema` step and the two move together. The SQL wins over any page, this one included.

## How claimius is built

1. Claimius is a Postgres schema that answers one question from the service's own database: what may this user do to this object. An object is an `object_type` and `object_id` pair (`mw:.nimpress/claimius/index.md`).
2. Four types and two bindings: an organization owns, a location places, a user acts, a claim says what may be done; a grant, `user_claim`, joins a user to a claim, and a binding, `claim_object`, joins a claim to an object (`mw:.nimpress/claimius/types.md`).
3. An organization nests through `sa_owner_id`. A root is `sa_owner_id = sa_root_id = id` and is a tenant; a child copies its parent's root. A root changes only through `migrate_root`, and an update that changes `sa_root_id` is refused (`mw:.nimpress/claimius/organizations.md`, `mw:disciple/database/V2.3__claimius_functions_access.sql:251`, `mw:disciple/database/V2.4__claimius_functions_external.sql:3116`).
4. A location nests through `sa_parent_id` with `sa_root_id`, and sits in its owner's ownership tree as well (`mw:.nimpress/claimius/locations.md`). Quillborne keeps no locations.
5. A claim is a mask and an inherit flag, of type `system`, `user`, `service` or `virtual` (`mw:shared/models.go:293`). A grant may carry a window; a binding may carry a mask that narrows its claim and never widens it.
6. The bits: owner 1, write 2, read 4, execute 8, deny 16, member 32, all 15, tested as `(stored & required) = required`. Owner implies write, read and execute, write implies read and execute, execute implies read; member stands alone (`mw:.nimpress/claimius/claims.md` The access bits, `mw:shared/models.go:111`).
7. A binding reaches the rows below its object only when `inherits` is true on both the claim and the binding, through three trees: ownership, location and a table's own parenthood (`mw:.nimpress/claimius/claims.md` Cascade). A binding whose object is another claim composes the two, one hop.
8. Every ancestor of every node is stored as a closure in `inheritance_info`, and the answer per user and object in `user_object`. A write settles its actor's pairs only; every other user settles on their next read (`mw:.nimpress/claimius/index.md` Principles 3).
9. A writer may not bind more than they hold on the object, and the creator of a row holds it in full through its `sa_created_by` grant (`mw:.nimpress/claimius/claims.md` What a writer may bind).
10. A table joins by carrying `sa_owner_id`, `sa_created_by`, `sa_created_at`, `sa_updated_at` and `sa_deleted_at`, `sa_parent_id` with `sa_root_id` both or neither, and by `upsert_table_info('public.<table>')` (`mw:.nimpress/claimius/objects.md` Registration, `mw:disciple/database/V2.4__claimius_functions_external.sql:3187`).
11. Search is the reader's pairs, the scope and the query's matches intersected; a host adds its own rows with `upsert_search_source` (`mw:.nimpress/claimius/search.md`). `GetSearch` calls `claimius.search` (`internal/handler/search.go:109`).

## The prophet and the disciple

12. Samna Auth is the prophet: it holds every app with its keys and decides every shared row. Quillborne is a disciple: it mirrors its one app, writes its own registered tables, and routes shared writes to the prophet (`mw:.nimpress/claimius/prophets.md`). `database/system/V1.0__system_init_disciple.sql` is the bootstrap, `upsert_disciple_state`.
13. No request calls the prophet to authenticate or authorize a read; the disciple answers from its own copy (`mw:.nimpress/claimius/middleware/index.md` Authentication).
14. On a deployed disciple a `claim`, a `claim_object`, a `user_claim` and an `organization` go to the prophet and the answer is upserted locally; the service's own tables are written locally. With `SAUTH_DEBUG_USER_ID` set nothing is routed and every write runs through the local claimius functions (`mw:.nimpress/claimius/middleware/writes.md` Where a write lands, `mw:disciple/sdb/db.go:24`). A local run proves nothing about the prophet path.
15. A write that lands on the disciple alone, a local `claimius.insert_claim_object`, is never seen by the prophet, its feed or any other disciple (`mw:.nimpress/claimius/middleware/writes.md` 3).

## The middleware from Go

16. One handle, `sdb.Instance()`, initialised once in `cmd/main.go:88`. A consumer imports `disciple/sdb`, `disciple/echo`, `disciple/sam` and `smw`, never `shared` (`mw:.nimpress/claimius/middleware/index.md` Packages).
17. One row: `sdb.Instance().MutationAccess(ctx, actor, id, type, required)` answers an `AccessClaim`, `ErrNotFound` or `ErrNoAccess`, so one round trip is 200, 404 or 403 (`mw:shared/access.go:41`; `internal/handler/campaign.go:156`).
18. A list: the service's own bun query through `sdb.ObjectWhere(q, actor, type, required, nil, nil, 0)` (`mw:shared/query.go:118`; `internal/handler/campaign.go:134`). A listing carries no grant; acting on a row in it goes through `MutationAccess`.
19. A write to a claimius type: `sdb.Instance().NewInsert().Model(&m).Access(ac).Conn(tx)`, and `NewUpdate` and `NewDelete` the same. `.Access(ac)` is the only thing that stamps the actor, and `.Conn(tx)` puts the local part in the caller's transaction (`mw:shared/query.go:351`; `internal/handler/share.go:54`).
20. A claim: `sdb.Instance().CreateClaim(ctx, tx, ac, sdb.CreateClaimParams{...})`, which is of type virtual unless `Type` says otherwise, and `CreateVirtualClaim`, which makes the claim, binds it to one object and grants it to one user (`mw:shared/methods_claim.go:15`, `mw:shared/claims.go:537`).
21. Reading who holds what: `GetClaimsMany(ctx, ids, ownerIDs)`, `GetBindings`, `GetGrants`, `GetOrganization` and `GetOrganizationsMany` (`mw:shared/claims.go:593`, `:602`, `:612`, `mw:shared/organization.go:13`, `:257`).
22. The audit: `sdb.Write(ctx, tx, operation, kind, type, id, ownerID, createdBy, message)` in the transaction of the change (`mw:disciple/sdb/db.go:36`).
23. Sign in, the callback, sign out and `/api/auth/me` are the middleware's handlers behind `smw.UserAuthMiddleware`, mounted in `cmd/main.go:111`.

## What Quillborne does with it

24. Nothing new is ever added to Samna Auth or the middleware for Quillborne: no function, no column, no route. A need is met by what the pinned middleware already gives.
25. When Quillborne and the middleware disagree, Quillborne is wrong, and Quillborne changes.
26. A campaign is an organization of kind `campaign` under Knights of the Cauldron, inserted through the builder (`internal/handler/campaign.go:222`); `data.md` A campaign is an organization.
27. The dungeon master is the owner of that organization. The owner invites people into it and gives each the access they need.
28. Membership is the organization's Member claim: a claim bound on the organization with `sdb.ACCESS_MEMBER`, found by that bit, granted to the member.
29. A handler takes its writer with `postWriter` and binds the creator with `postOwnerBinding` (`internal/handler/share.go:22`, `:42`); a claim, a binding and a grant are made only with the helpers of that file and the claim routes (`internal/handler/routes.go:128`).
30. A page changes root only through `claimius.migrate_root` (`internal/handler/resource.go:402`, `:434`). claimius cannot make a child a root, so a top level is a shared root (`data.md` The page tree).
31. No SQL of the service writes claimius. The functions its SQL calls are `upsert_table_info`, `delete_table_info`, `upsert_disciple_state` and `upsert_search_source`; `database/debug/` alone defines its identity directly, because it runs only where `SAUTH_DEBUG_USER_ID` is set.
32. A Samna Auth app change and a deployed database are the owner's (`workflow.md` 8). The live app is read with `sauth app manifest`, never from a file here.

## Good and bad

33. Good: `postOrganization`, `getClaim`, `getMemberships` and `PostMember` in nimployer's `internal/service/team/team.go`: a team is an organization, its members hold the claim bound on it with the member bit, and the claim is found by the bit.
34. Good: `PostBookable` in bookable_server's `internal/handler/bookable.go`: EXECUTE on the owning organization, the row and its audit in one transaction, the actor's claim bound through the builder.
35. Good: `GetCampaign` (`internal/handler/campaign.go:146`): one `MutationAccess`, 404 or 403 from what it answers.
36. Bad: a claim found by its name, or its id carried on a model. The campaign's two claims are found by the member bit on the organization's bindings, `getMemberships` (`internal/handler/share.go`). Membership is rule 28.
37. Bad: an `UPDATE` that sets `sa_root_id`, or a parent under another root. Rule 30.
38. Bad: `claimius.insert_claim`, `insert_claim_object` or `insert_user_claim` called from the service's SQL or Go. Rule 15.
39. Bad: a `SELECT` from a `claimius.*` table in a handler, or an `if` on a user id, a role name or a claim name to decide access. The lookups of 17 and 18 decide.
40. Bad: asking for a new middleware function because a case is awkward. Rule 24.

## Do and don't

41. Do read the SQL, then the Go, then the two reference services before saying a capability exists or not, and cite each.
42. Do bind every new row before anything reads it, with the mask the table should have and nothing wider.
43. Do write the access test beside the route: who may, and who may not (`test/go/access_test.go`).
44. Don't decide access in a component, a query or a helper of Quillborne's own.
45. Don't assume another user's access right after a write; they settle on their next read.
46. Don't run a `sauth` write or smig against a deployed environment without the owner's word.

---
description: How Go is written here, the names, the handler shape, what a route carries, the tests, with the file that shows each and what is refused
paths:
  - "internal/**"
  - "cmd/**"
  - "test/go/**"
---

# Go

The `go` agent holds this file. Who owns and who may reach a row is `claimius.md`, a table's shape `sql.md`, the wire `data.md`, the cli `cli.md`. The nearest handler that does the same thing is the example: read it whole before writing.

## Names

1. A function starts with `Get`, `Post`, `Put` or `Delete`, lower case when it is not exported, and never carries `By`. Singular returns one, plural many.
2. A handler is the verb and the resource of its route, the parent first. A request body is `Body<Thing>`, an object type `OBJECT_TYPE_<TABLE>`, a state group `Group<Thing>` with `<Thing>Data`.
3. A name is the user's: proposed, and written only once said. No suffix that is not already in the code.

## The patterns

4. Every handler reads top to bottom in one order: the actor, the ids, the body bound and checked inline, the access call, the work in one transaction with its audit, then the answer.
5. A body is a struct of pointer fields, so an absent field changes nothing.
6. Every answer leaves through nimbody's `respond`. The envelope, paging and search are nimbody's and change there or not at all.
7. An error becomes its status on the line it happens, three ways: not found is 404, no access is 403, and any other error is a fault, logged under the handler's name and answered 500. A row read answers 404 only for no rows. A fault is never answered 403 or 404.
8. Access is three calls and nothing else: a list through `sdb.ObjectWhere`, one row through `MutationAccess`, a create through the shared writer, which binds the creator. Which claim, which mask and which owner is `claimius.md`.
9. A dependency is wired once where the service starts and reached through its `Instance()`. A call passes only what varies per request.
10. A sub resource handler wraps its root handler and never copies its logic.
11. A model names its table, carries the claimius columns, marks what the api composes as not stored, and is snake_case on the wire. A model change is followed by `just gen-types`.
12. A write posts its event after it succeeds: a topic, a kind, an id and an op, never a row.
13. A route never moves alone. It carries its line in the route table, its verb in the cli's resource table, its state group, the state document its test rewrites, and its records in the local table.
14. Every route ships with a test of who may and who may not reach it, and every stream with one of what it delivers to whom; `tests.md`.
15. The api is a contract: no route, parameter, field, status or enum value changes or is added unless the user named that exact change. A need is met first through what the api already has.
16. Every build, test and run is a recipe of the `justfile`.

## Good and bad

17. Good: a read that is one function, each refusal and each fault mapped where it happens.
18. Good: an import that makes its row by calling the handler as the record's owner, so the handler makes every claim.
19. Bad: a store or a client built in the argument list of a call. Rule 9.
20. Bad: a helper that maps errors to statuses or wraps the access call. Rule 7.
21. Bad: a sibling of an existing function, `Strict`, `V2`, `New`, `Helper`, or a new file for a helper that pairs with one. The function changes in place and every call site with it.
22. Bad: a required field made optional, or a shared check loosened, so a new path can be taken. The approach is wrong, not the constraint.
23. Bad: a row or a claim written by SQL for a test or a seed.
24. Bad: a field, a parameter or a where that names what a row belongs to beside its owner. `claimius.md` 4.

## Do and don't

25. Do change code in place and carry a rename to every call site.
26. Do run `just gate` before the work is called done.
27. Don't write a comment.
28. Don't keep a fallback, a backwards compatible path or an old branch beside the new one.
29. Don't filter on access in Go; what the access calls answer is what the reader may see.

---
description: How claimius is built, the prophet and the disciple, how the middleware is used from Go, and what Quillborne does and never does with them
paths:
  - "internal/**"
  - "cmd/main.go"
  - "database/**"
  - "deploy/sauth/**"
---

# Claimius, Samna Auth and the middleware

The `claimius` agent holds this file. Ownership, relation and access between all rows are claimius and nothing else, without exception. The pinned middleware is the source: its SQL first, then its Go, then how bookable_server and nimployer use it; the SQL wins over any page, this one included.

## Ownership, relation and access

1. Every row is done one way: who owns it is `sa_owner_id`, who may reach it is a claim bound to it, and what it belongs to is its owner. Anything else is a workaround and is refused.
2. A campaign is its organization and shares its id, so the campaign of any row is that row's `sa_owner_id`.
3. A row no campaign keeps is owned by Knights of the Cauldron, `SERVER_OWNER_ID`, and is its maker's through the grant it was created under.
4. Nothing names the owning organization beside `sa_owner_id`: no column, model field, body field, response field, parameter or where of the service's own, and no join table, array column or helper that says who owns a row or who may reach it.
5. On the wire the organization is `owner_id` and the person is `user_id`, on every model, body and filter.
6. The rows of one owner are a where on `sa_owner_id` on the service's own query, beside the access predicate, which has no owner argument.
7. A row that joins or leaves a campaign changes `sa_owner_id`, and nothing else records the move.

## How claimius is built

8. Claimius answers one question from the service's own database: what may this user do to this object. An object is an `object_type` and `object_id` pair.
9. An organization owns, a user acts, a claim says what may be done; a grant joins a user to a claim and a binding joins a claim to an object.
10. A claim is a mask and an inherit flag. A binding may narrow its claim and never widens it, and a grant may carry a window.
11. The bits are owner, write, read, execute, deny and member. Owner implies write, read and execute, write implies read and execute, execute implies read, and member stands alone.
12. A binding reaches the rows below its object only when both the claim and the binding inherit.
13. The creator of a row holds it in full through the grant it was created under, and a writer never binds more than they hold.
14. A write settles its actor's access only; every other user settles on their next read.
15. A table joins by carrying the `sa_` columns and registering itself; `sql.md` has the columns and the call.
16. A root changes only through `migrate_root`. claimius cannot make a child a root.

## The prophet and the disciple

17. Samna Auth is the prophet and decides every shared row. Quillborne is a disciple: it answers every read from its own copy and routes writes of claims, bindings, grants and organizations to the prophet.
18. With `SAUTH_DEBUG_USER_ID` set nothing is routed, so a local run proves nothing about the prophet path.
19. A write that lands on the disciple alone is never seen by the prophet or any other disciple, so no SQL or Go of the service calls a claimius insert function.

## The middleware from Go

20. One handle, `sdb.Instance()`, wired once where the service starts.
21. One row is `MutationAccess`, a list is the service's own query through `sdb.ObjectWhere`, and a create asks for the owning organization, stamps the creator's grant and binds the creator's claim. A listing carries no grant; acting on a row in it goes through `MutationAccess`.
22. Every access answer is mapped three ways: not found is 404, no access is 403, and any other error is a fault, logged and answered 500. A fault is never answered as a refusal.
23. A claimius type is written through the builder with `.Access(ac)`, which alone stamps the actor, inside the caller's transaction, with the audit written in the same transaction.
24. Who holds what is read through the middleware's own getters for claims, bindings, grants and organizations, never from a `claimius.*` table.
25. Sign in, sign out and the session are the middleware's handlers; the service writes none of its own.

## What Quillborne does with it

26. Nothing new is ever added to Samna Auth or the middleware for Quillborne. A need is met by what the pinned middleware already gives.
27. When Quillborne and the middleware disagree, Quillborne is wrong, and Quillborne changes.
28. A campaign is an organization of kind `campaign` under Knights of the Cauldron, and the dungeon master is its owner, who invites people in and gives each the access they need.
29. Membership is a claim bound on the organization with the member bit and granted to the member. A claim is found by its bits on the organization's bindings, never by a name and never by an id kept on a row or a model.
30. A claim, a binding and a grant are made only through the claim helpers the handlers share and the claim routes.
31. A Samna Auth app change and a deployed database are the owner's. The live app is read with `sauth`, never from a file here.

## Good and bad

32. Good: nimployer's team: an organization whose members hold the claim bound on it with the member bit, found by the bit.
33. Good: bookable_server's create: EXECUTE on the owning organization, the row and its audit in one transaction, the actor's claim bound through the builder, and no organization column beside `sa_owner_id`.
34. Bad: a `campaign_id`, an `organization_id` or a list of ids that says what a row belongs to.
35. Bad: an `if` on a user id, a role name or a claim name, or a filter in Go or in a component, to decide access.
36. Bad: an `UPDATE` that sets `sa_root_id`, or a parent under another root.
37. Bad: asking for a new middleware function because a case is awkward.

## Do and don't

38. Do read the SQL, then the Go, then the two reference services before saying a capability exists or not.
39. Do bind every new row before anything reads it, with the mask it should have and nothing wider.
40. Do ship every route with the test of who may and who may not reach it.
41. Don't assume another user's access right after a write.
42. Don't run a `sauth` write or smig against a deployed environment without the owner's word.

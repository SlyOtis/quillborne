package qubo

import (
	"net/http"

	"github.com/nimling/nimbody/cli"
)

const (
	verbGet     = "get"
	verbCreate  = "create"
	verbReplace = "replace"
	verbDelete  = "delete"
	verbList    = "list"
	verbStream  = "stream"
	verbData    = "data"
	verbUpload  = "upload"
	verbMove    = "move"
	verbPlayed  = "played"
	verbSearch  = "search"
)

const (
	apiPrefix     = "/api"
	headerAppSlug = "SAuth-App-Slug"

	mePath        = apiPrefix + "/auth/me"
	loginPath     = apiPrefix + "/auth/login"
	cliTokenPath  = apiPrefix + "/auth/cli/token"
	cliRevokePath = apiPrefix + "/auth/cli/revoke"
	healthPath    = "/status/health/readiness"
)

const cliName = "qubo"

const (
	envEndpoint     = "QUBO_ENDPOINT"
	envAppSlug      = "QUBO_APP_SLUG"
	envClientID     = "QUBO_CLIENT_ID"
	envClientSecret = "QUBO_CLIENT_SECRET"
)

func getOp(short string, paths ...string) cli.Verb {
	return cli.Verb{Name: verbGet, Short: short, Method: http.MethodGet, Paths: paths}
}

func createOp(short string, paths ...string) cli.Verb {
	return cli.Verb{Name: verbCreate, Short: short, Method: http.MethodPost, Paths: paths, Body: true}
}

func replaceOp(short string, paths ...string) cli.Verb {
	return cli.Verb{Name: verbReplace, Short: short, Method: http.MethodPut, Paths: paths, Body: true}
}

func deleteOp(short string, paths ...string) cli.Verb {
	return cli.Verb{Name: verbDelete, Short: short, Method: http.MethodDelete, Paths: paths}
}

func readOp(name string, short string, paths ...string) cli.Verb {
	return cli.Verb{Name: name, Short: short, Method: http.MethodGet, Paths: paths}
}

func streamOp(short string, paths ...string) cli.Verb {
	return cli.Verb{Name: verbStream, Short: short, Method: http.MethodGet, Paths: paths, Stream: true}
}

func actionOp(name string, short string, paths ...string) cli.Verb {
	return cli.Verb{Name: name, Short: short, Method: http.MethodPost, Paths: paths, Body: true}
}

func putOp(name string, short string, paths ...string) cli.Verb {
	return cli.Verb{Name: name, Short: short, Method: http.MethodPut, Paths: paths, Body: true}
}

func Resources() []cli.Resource {
	return []cli.Resource{
		{
			Name:  "profile",
			Short: "The signed in player's profile, and the profiles the player reads",
			Verbs: []cli.Verb{
				getOp("Read your own profile, or a player's by user id", apiPrefix+"/profile", apiPrefix+"/profile/{user_id}"),
				createOp("Create your profile, body {email, display_name, photo_url, preferences}", apiPrefix+"/profile"),
				replaceOp("Change your profile, body {email, display_name, photo_url, preferences, friends}", apiPrefix+"/profile"),
				readOp(verbList, "Find profiles by ?email= or ?ids=", apiPrefix+"/profile/list"),
				streamOp("Follow your profile's events", apiPrefix+"/profile/stream"),
			},
			Children: []cli.Resource{
				{
					Name:  "details",
					Short: "The integration keys the player holds",
					Verbs: []cli.Verb{
						getOp("Read which keys are held", apiPrefix+"/profile/details"),
						replaceOp("Set or remove a key, body {replicate}", apiPrefix+"/profile/details"),
					},
				},
				{
					Name:  "friend",
					Short: "The player's friends",
					Verbs: []cli.Verb{
						createOp("Add a friend by email, body {email}", apiPrefix+"/profile/friend"),
						deleteOp("Remove a friend by user id", "", apiPrefix+"/profile/friend/{user_id}"),
					},
				},
			},
		},
		{
			Name:  "character",
			Short: "Character sheets",
			Verbs: []cli.Verb{
				getOp("List your characters, or read one", apiPrefix+"/character", apiPrefix+"/character/{id}"),
				createOp("Create a character, body {character, metadata, campaign_id}", apiPrefix+"/character"),
				replaceOp("Change a character, body {character, metadata}", "", apiPrefix+"/character/{id}"),
				deleteOp("Delete a character", "", apiPrefix+"/character/{id}"),
				putOp(verbPlayed, "Mark a character as played now", "", apiPrefix+"/character/{id}/played"),
				streamOp("Follow a character's events", "", apiPrefix+"/character/{id}/stream"),
			},
			Children: []cli.Resource{
				{
					Name:  "sources",
					Short: "The rule systems a character declares",
					Verbs: []cli.Verb{
						getOp("Read the sources of a character", "", apiPrefix+"/character/{character_id}/sources"),
						replaceOp("Set the sources of a character, body {sources}", "", apiPrefix+"/character/{character_id}/sources"),
					},
				},
			},
		},
		{
			Name:  "vehicle",
			Short: "The vessels the table sails",
			Verbs: []cli.Verb{
				getOp("List the vehicles you reach, or read one", apiPrefix+"/vehicle", apiPrefix+"/vehicle/{id}"),
				createOp("Build a vehicle, body {name, system, layout, template, components, crew, campaign_id}", apiPrefix+"/vehicle"),
				replaceOp("Change a vehicle, body with revision for a components change", "", apiPrefix+"/vehicle/{id}"),
				deleteOp("Scuttle a vehicle", "", apiPrefix+"/vehicle/{id}"),
				streamOp("Follow a vehicle's events", "", apiPrefix+"/vehicle/{id}/stream"),
			},
		},
		{
			Name:  "campaign",
			Short: "Campaigns, the tables of play",
			Verbs: []cli.Verb{
				getOp("List your campaigns, or read one", apiPrefix+"/campaign", apiPrefix+"/campaign/{id}"),
				createOp("Create a campaign, body {name, description, is_active, settings}", apiPrefix+"/campaign"),
				replaceOp("Change a campaign", "", apiPrefix+"/campaign/{id}"),
				deleteOp("Close a campaign", "", apiPrefix+"/campaign/{id}"),
				streamOp("Follow a campaign's events", "", apiPrefix+"/campaign/{id}/stream"),
			},
			Children: []cli.Resource{
				{
					Name:  "player",
					Short: "The players seated at the table",
					Verbs: []cli.Verb{
						createOp("Seat a player by email, body {email}", "", apiPrefix+"/campaign/{campaign_id}/player"),
						deleteOp("Unseat a player", "", "", apiPrefix+"/campaign/{campaign_id}/player/{user_id}"),
					},
				},
				{
					Name:  "character",
					Short: "The characters at the table",
					Verbs: []cli.Verb{
						getOp("List the characters of a campaign", "", apiPrefix+"/campaign/{campaign_id}/character"),
						actionOp(verbCreate, "Seat a character at the table", "", "", apiPrefix+"/campaign/{campaign_id}/character/{character_id}"),
						deleteOp("Take a character from the table", "", "", apiPrefix+"/campaign/{campaign_id}/character/{character_id}"),
					},
				},
				{
					Name:  "map",
					Short: "The maps of a campaign",
					Verbs: []cli.Verb{
						getOp("List the maps of a campaign", "", apiPrefix+"/campaign/{campaign_id}/map"),
						createOp("Draw a map, body {title, image_url, layers, markers, is_visible, plan, parent_map_id}", "", apiPrefix+"/campaign/{campaign_id}/map"),
						replaceOp("Change a map", "", "", apiPrefix+"/campaign/{campaign_id}/map/{map_id}"),
						deleteOp("Delete a map", "", "", apiPrefix+"/campaign/{campaign_id}/map/{map_id}"),
					},
				},
				{
					Name:  "encounter",
					Short: "The encounters of a campaign",
					Verbs: []cli.Verb{
						getOp("List the encounters of a campaign", "", apiPrefix+"/campaign/{campaign_id}/encounter"),
						createOp("Set up an encounter, body {title, combatants, round, turn, is_active, share_users, share_campaigns}", "", apiPrefix+"/campaign/{campaign_id}/encounter"),
						replaceOp("Change an encounter", "", "", apiPrefix+"/campaign/{campaign_id}/encounter/{encounter_id}"),
						deleteOp("Delete an encounter", "", "", apiPrefix+"/campaign/{campaign_id}/encounter/{encounter_id}"),
					},
				},
				{
					Name:  "song",
					Short: "The music library of a campaign",
					Verbs: []cli.Verb{
						getOp("List the songs of a campaign", "", apiPrefix+"/campaign/{campaign_id}/song"),
						createOp("Add a song, body {title, address, duration, share_users, share_campaigns}", "", apiPrefix+"/campaign/{campaign_id}/song"),
						replaceOp("Change a song", "", "", apiPrefix+"/campaign/{campaign_id}/song/{song_id}"),
						deleteOp("Delete a song", "", "", apiPrefix+"/campaign/{campaign_id}/song/{song_id}"),
					},
				},
				{
					Name:  "chat",
					Short: "The messages and rolls of a campaign's table",
					Verbs: []cli.Verb{
						getOp("List the chat of a campaign", "", apiPrefix+"/campaign/{campaign_id}/chat"),
						createOp("Post a message or a roll, body {kind, body, is_hidden, formula, dice, roll, total}", "", apiPrefix+"/campaign/{campaign_id}/chat"),
						replaceOp("Edit your entry", "", "", apiPrefix+"/campaign/{campaign_id}/chat/{entry_id}"),
						deleteOp("Delete your entry", "", "", apiPrefix+"/campaign/{campaign_id}/chat/{entry_id}"),
					},
				},
			},
		},
		{
			Name:  "resource",
			Short: "Lore pages of the seven kinds",
			Verbs: []cli.Verb{
				getOp("List pages by ?kind= and ?campaign_id= or ?user_id=, or read one", apiPrefix+"/resource", apiPrefix+"/resource/{id}"),
				createOp("Write a page, body {kind, name, description, campaign_id, parent_id, share_users, share_campaigns, ...fields}", apiPrefix+"/resource"),
				replaceOp("Change a page", "", apiPrefix+"/resource/{id}"),
				deleteOp("Delete a page", "", apiPrefix+"/resource/{id}"),
				streamOp("Follow a page's events", "", apiPrefix+"/resource/{id}/stream"),
			},
			Children: []cli.Resource{
				{
					Name:  "update",
					Short: "The live editing updates of a page",
					Verbs: []cli.Verb{
						getOp("Read the updates of a page", "", apiPrefix+"/resource/{resource_id}/update"),
						createOp("Append an update, body {body}", "", apiPrefix+"/resource/{resource_id}/update"),
						replaceOp("Fold the updates of a page, body {body}", "", apiPrefix+"/resource/{resource_id}/update"),
						deleteOp("Drop the updates of a page", "", apiPrefix+"/resource/{resource_id}/update"),
					},
				},
			},
		},
		{
			Name:  "asset",
			Short: "Files, block documents and folders",
			Verbs: []cli.Verb{
				getOp("List the assets you reach, or read one", apiPrefix+"/asset", apiPrefix+"/asset/{id}"),
				cli.Verb{Name: verbCreate, Short: "Store an asset: a json body {name, mime_type, parent_id, campaign_id, document} or --upload with name and mime_type", Method: http.MethodPost, Paths: []string{apiPrefix + "/asset"}, Body: true, Upload: true},
				replaceOp("Change an asset's name, description, index, icon, banner or properties", "", apiPrefix+"/asset/{id}"),
				deleteOp("Delete an asset", "", apiPrefix+"/asset/{id}"),
				readOp(verbData, "Read the bytes of an asset", "", apiPrefix+"/asset/{id}/data"),
				cli.Verb{Name: verbUpload, Short: "Replace the bytes of an asset with --upload", Method: http.MethodPost, Paths: []string{"", apiPrefix + "/asset/{id}"}, Body: true, Upload: true},
				actionOp(verbMove, "Move assets within their root, body {ids, target_id}", apiPrefix+"/file/move"),
			},
			Children: []cli.Resource{
				{
					Name:  "object",
					Short: "The attachment of an asset to a row",
					Verbs: []cli.Verb{
						getOp("List the attachments by ?object_type= and ?object_id=", apiPrefix+"/asset/object"),
						createOp("Attach an asset, body {object_type, object_id, properties}", "", apiPrefix+"/asset/{asset_id}/object"),
						replaceOp("Change an attachment", "", apiPrefix+"/asset/{asset_id}/object"),
						deleteOp("Detach an asset from a row", "", "", apiPrefix+"/asset/{asset_id}/object/{object_id}"),
					},
				},
			},
		},
		{
			Name:  "file",
			Short: "The folder tree",
			Verbs: []cli.Verb{
				getOp("List the roots you reach, or the children of a folder", apiPrefix+"/file", apiPrefix+"/file/{id}"),
			},
		},
		{
			Name:  "tag",
			Short: "Tags on any row",
			Verbs: []cli.Verb{
				getOp("List the tags, or read one", apiPrefix+"/tag", apiPrefix+"/tag/{id}"),
				createOp("Make a tag, body {name}", apiPrefix+"/tag"),
				replaceOp("Rename a tag", "", apiPrefix+"/tag/{id}"),
				deleteOp("Delete a tag", "", apiPrefix+"/tag/{id}"),
			},
			Children: []cli.Resource{
				{
					Name:  "object",
					Short: "The rows a tag is on",
					Verbs: []cli.Verb{
						createOp("Tag a row, body {object_type, object_id}", "", apiPrefix+"/tag/{tag_id}/object"),
						deleteOp("Untag a row, ?object_type= and ?object_id=", "", apiPrefix+"/tag/{tag_id}/object"),
					},
				},
			},
		},
		{
			Name:  "catalog",
			Short: "The shared class and race readings",
			Verbs: []cli.Verb{
				getOp("List the entries of a kind, classes or races, or read one by slug", "", apiPrefix+"/catalog/{kind}", apiPrefix+"/catalog/{kind}/{slug}"),
				replaceOp("Write an entry, body {name, description, digest, ...entry}", "", "", apiPrefix+"/catalog/{kind}/{slug}"),
			},
		},
		{
			Name:  "search",
			Short: "The shared search over everything you reach",
			Verbs: []cli.Verb{
				readOp(verbGet, "Search with ?q=, ?object_types=, ?tag_ids=", apiPrefix+"/search"),
				actionOp(verbSearch, "Search with a body {q, object_types, ids, exclude_ids, tag_ids, parent_id, parent_type, limit}", apiPrefix+"/search"),
			},
		},
		{
			Name:  "claim",
			Short: "The claims that decide who reads what",
			Verbs: []cli.Verb{
				getOp("Read a claim", "", apiPrefix+"/claim/{id}"),
				createOp("Make a claim, body {name, description, access}", apiPrefix+"/claim"),
			},
			Children: []cli.Resource{
				{
					Name:  "user",
					Short: "The players a claim is granted to",
					Verbs: []cli.Verb{
						createOp("Grant a claim, body {user_id}", "", apiPrefix+"/claim/{claim_id}/user"),
						deleteOp("Revoke a claim", "", "", apiPrefix+"/claim/{claim_id}/user/{user_id}"),
					},
				},
				{
					Name:  "object",
					Short: "The rows a claim is bound to",
					Verbs: []cli.Verb{
						getOp("List the claims bound to a row, by type and id", "", "", apiPrefix+"/{type}/{id}/claim"),
						createOp("Bind a claim, body {object_type, object_id, access}", "", apiPrefix+"/claim/{claim_id}/object"),
						deleteOp("Unbind a claim", "", "", apiPrefix+"/claim/{claim_id}/object/{object_id}"),
					},
				},
			},
		},
	}
}

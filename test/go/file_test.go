package test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/SlyOtis/quillborne/internal/handler"
	"github.com/SlyOtis/quillborne/internal/storage"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

type storedAsset struct {
	ID        string  `json:"id"`
	ParentID  string  `json:"parent_id"`
	RootID    string  `json:"root_id"`
	BlobURL   *string `json:"blob_url"`
	Path      string  `json:"path"`
	SizeBytes *int64  `json:"size_bytes"`
	Etag      *string `json:"etag"`
}

func requireBlob(t *testing.T) {
	t.Helper()
	requireStack(t)
	if err := storage.Init(context.Background()); err != nil {
		t.Skip("no local blob store, run just dev-blob first: " + err.Error())
	}
}

func raw(t *testing.T, actor uuid.UUID, method, target string, body io.Reader, headers, params map[string]string, run echo.HandlerFunc) *httptest.ResponseRecorder {
	t.Helper()
	e := echo.New()
	req := httptest.NewRequest(method, target, body)
	for name, value := range headers {
		req.Header.Set(name, value)
	}
	rec := httptest.NewRecorder()
	ctx := e.NewContext(req, rec)
	names := make([]string, 0, len(params))
	values := make([]string, 0, len(params))
	for name, value := range params {
		names = append(names, name)
		values = append(values, value)
	}
	ctx.SetParamNames(names...)
	ctx.SetParamValues(values...)
	ctx.Set("user_id", actor)
	if err := run(ctx); err != nil {
		t.Fatalf("%s %s: %v", method, target, err)
	}
	return rec
}

func getForm(t *testing.T, fields map[string]string, content []byte) (*bytes.Buffer, string) {
	t.Helper()
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	for name, value := range fields {
		if err := form.WriteField(name, value); err != nil {
			t.Fatal(err)
		}
	}
	part, err := form.CreateFormFile("file", fields["name"])
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := form.Close(); err != nil {
		t.Fatal(err)
	}
	return &body, form.FormDataContentType()
}

func postStoredFile(t *testing.T, actor uuid.UUID, fields map[string]string, content string) (int, storedAsset) {
	t.Helper()
	body, contentType := getForm(t, fields, []byte(content))
	rec := raw(t, actor, http.MethodPost, "/api/asset", body, map[string]string{"Content-Type": contentType}, nil, handler.PostAsset)
	var stored storedAsset
	if rec.Code == http.StatusCreated {
		stored = getStored(t, rec.Body.Bytes())
	}
	return rec.Code, stored
}

func getStored(t *testing.T, body []byte) storedAsset {
	t.Helper()
	var answer envelope
	var stored storedAsset
	if err := json.Unmarshal(body, &answer); err != nil || json.Unmarshal(answer.Data, &stored) != nil || stored.ID == "" {
		t.Fatalf("no asset in %s", string(body))
	}
	return stored
}

func getData(t *testing.T, actor uuid.UUID, method, assetID string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	return raw(t, actor, method, "/api/asset/"+assetID+"/data", nil, headers, map[string]string{"id": assetID}, handler.GetAssetData)
}

func TestAFileIsStoredAndStreamedWithItsEtagAndRanges(t *testing.T) {
	requireBlob(t)
	ensureProfile(t, dungeonMaster, "testy@quillborne.local")
	content := "0123456789abcdef"
	status, stored := postStoredFile(t, dungeonMaster, map[string]string{"name": "theme.ogg", "mime_type": "audio/ogg"}, content)
	if status != http.StatusCreated {
		t.Fatalf("PostAsset: %d", status)
	}
	digest := sha256.Sum256([]byte(content))
	sum := base64.RawURLEncoding.EncodeToString(digest[:])
	if stored.SizeBytes == nil || *stored.SizeBytes != 16 || stored.Etag == nil || *stored.Etag != sum {
		t.Fatalf("size and etag were not set on upload: %+v", stored)
	}
	if stored.BlobURL == nil || *stored.BlobURL != "user-"+dungeonMaster.String()+"/"+stored.ID {
		t.Fatalf("the blob is not keyed under the personal folder by id: %v", stored.BlobURL)
	}
	etag := `"` + sum + `"`

	full := getData(t, dungeonMaster, http.MethodGet, stored.ID, nil)
	if full.Code != http.StatusOK || full.Body.String() != content {
		t.Fatalf("full read: %d %q", full.Code, full.Body.String())
	}
	if full.Header().Get("ETag") != etag || full.Header().Get("Accept-Ranges") != "bytes" || full.Header().Get("Content-Type") != "audio/ogg" || full.Header().Get("Content-Length") != "16" {
		t.Fatalf("headers: %v", full.Header())
	}
	if again := getData(t, dungeonMaster, http.MethodGet, stored.ID, map[string]string{"If-None-Match": etag}); again.Code != http.StatusNotModified {
		t.Fatalf("If-None-Match: %d", again.Code)
	}
	part := getData(t, dungeonMaster, http.MethodGet, stored.ID, map[string]string{"Range": "bytes=2-5"})
	if part.Code != http.StatusPartialContent || part.Body.String() != "2345" || part.Header().Get("Content-Range") != "bytes 2-5/16" || part.Header().Get("Content-Length") != "4" {
		t.Fatalf("range: %d %q %s", part.Code, part.Body.String(), part.Header().Get("Content-Range"))
	}
	tail := getData(t, dungeonMaster, http.MethodGet, stored.ID, map[string]string{"Range": "bytes=-3"})
	if tail.Code != http.StatusPartialContent || tail.Body.String() != "def" || tail.Header().Get("Content-Range") != "bytes 13-15/16" {
		t.Fatalf("suffix range: %d %q", tail.Code, tail.Body.String())
	}
	bad := getData(t, dungeonMaster, http.MethodGet, stored.ID, map[string]string{"Range": "bytes=40-50"})
	if bad.Code != http.StatusRequestedRangeNotSatisfiable || bad.Header().Get("Content-Range") != "bytes */16" {
		t.Fatalf("unsatisfiable range: %d %s", bad.Code, bad.Header().Get("Content-Range"))
	}
	if head := getData(t, dungeonMaster, http.MethodHead, stored.ID, nil); head.Code != http.StatusOK || head.Body.Len() != 0 || head.Header().Get("Content-Length") != "16" || head.Header().Get("Content-Type") != "audio/ogg" {
		t.Fatalf("head: %d %d %v", head.Code, head.Body.Len(), head.Header())
	}

	if status, answer := call(t, dungeonMaster, http.MethodGet, "/api/file", "", nil, handler.GetFiles); status != http.StatusOK || !listed(t, answer, stored.ID) {
		t.Fatalf("the upload is not listed in the personal folder: %d", status)
	}
	if status, answer := call(t, dungeonMaster, http.MethodGet, "/api/asset?mime_type=audio/*", "", nil, handler.GetAssets); status != http.StatusOK || !listed(t, answer, stored.ID) {
		t.Fatalf("the upload is not listed among the assets: %d", status)
	}
}

func TestAFileIsReadOnlyByThoseItsClaimsReach(t *testing.T) {
	requireBlob(t)
	ensureProfile(t, dungeonMaster, "testy@quillborne.local")
	ensureProfile(t, player, "pip@quillborne.local")
	campaignID := postCampaign(t)
	status, stored := postStoredFile(t, dungeonMaster, map[string]string{"name": "map.png", "mime_type": "image/png", "campaign_id": campaignID}, "map bytes")
	if status != http.StatusCreated {
		t.Fatalf("PostAsset: %d", status)
	}
	if stored.BlobURL == nil || *stored.BlobURL != "campaign-"+campaignID+"/"+stored.ID {
		t.Fatalf("the blob is not keyed under the campaign folder by id: %v", stored.BlobURL)
	}
	params := map[string]string{"id": stored.ID}

	if rec := getData(t, player, http.MethodGet, stored.ID, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("a player away from the table was not answered 404: %d", rec.Code)
	}
	if status, _ := call(t, player, http.MethodGet, "/api/asset/"+stored.ID, "", params, handler.GetAsset); status != http.StatusNotFound {
		t.Fatalf("a player away from the table read the campaign asset: %d", status)
	}
	if status, answer := call(t, player, http.MethodGet, "/api/asset", "", nil, handler.GetAssets); status != http.StatusOK || listed(t, answer, stored.ID) {
		t.Fatalf("a player away from the table listed the campaign asset: %d", status)
	}
	seatPlayer(t, campaignID)
	if rec := getData(t, player, http.MethodGet, stored.ID, nil); rec.Code != http.StatusOK || rec.Body.String() != "map bytes" {
		t.Fatalf("a seated player was refused the campaign file: %d", rec.Code)
	}
	if status, answer := call(t, player, http.MethodGet, "/api/file?parent_id="+stored.ParentID, "", nil, handler.GetFiles); status != http.StatusOK || !listed(t, answer, stored.ID) {
		t.Fatalf("a seated player does not see the campaign folder: %d", status)
	}
	body, contentType := getForm(t, map[string]string{"name": "map.png"}, []byte("overwritten"))
	if rec := raw(t, player, http.MethodPost, "/api/asset/"+stored.ID, body, map[string]string{"Content-Type": contentType}, params, handler.PostAssetUpload); rec.Code != http.StatusForbidden {
		t.Fatalf("a player overwrote the dungeon master's file: %d", rec.Code)
	}
	if status, _ := call(t, player, http.MethodDelete, "/api/asset/"+stored.ID, "", params, handler.DeleteAsset); status != http.StatusForbidden {
		t.Fatalf("a player deleted the dungeon master's file: %d", status)
	}

	body, contentType = getForm(t, map[string]string{"name": "map.png"}, []byte("new map"))
	rec := raw(t, dungeonMaster, http.MethodPost, "/api/asset/"+stored.ID, body, map[string]string{"Content-Type": contentType}, params, handler.PostAssetUpload)
	if rec.Code != http.StatusOK {
		t.Fatalf("the dungeon master could not replace the bytes: %d", rec.Code)
	}
	if replaced := getStored(t, rec.Body.Bytes()); replaced.Etag == nil || *replaced.Etag == *stored.Etag || replaced.SizeBytes == nil || *replaced.SizeBytes != 7 {
		t.Fatalf("the replaced bytes kept their etag or size: %+v", replaced)
	}
	if rec := getData(t, player, http.MethodGet, stored.ID, nil); rec.Body.String() != "new map" {
		t.Fatalf("the replaced bytes are not served: %q", rec.Body.String())
	}

	if status, _ := call(t, dungeonMaster, http.MethodDelete, "/api/asset/"+stored.ParentID, "", map[string]string{"id": stored.ParentID}, handler.DeleteAsset); status != http.StatusBadRequest {
		t.Fatalf("the campaign folder was deleted: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodDelete, "/api/asset/"+stored.ID, "", params, handler.DeleteAsset); status != http.StatusOK {
		t.Fatalf("DeleteAsset: %d", status)
	}
	if rec := getData(t, dungeonMaster, http.MethodGet, stored.ID, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("a deleted file still streams: %d", rec.Code)
	}
	if _, err := storage.Download(context.Background(), *stored.BlobURL, 0, 1); err == nil || !storage.IsMissing(err) {
		t.Fatalf("the blob outlived its asset: %v", err)
	}
}

func TestAFileIsPostedOnlyWhereTheWriterMayWrite(t *testing.T) {
	requireBlob(t)
	ensureProfile(t, dungeonMaster, "testy@quillborne.local")
	ensureProfile(t, player, "pip@quillborne.local")
	campaignID := postCampaign(t)
	status, first := postStoredFile(t, dungeonMaster, map[string]string{"name": "map.png", "mime_type": "image/png", "campaign_id": campaignID}, "map")
	if status != http.StatusCreated {
		t.Fatalf("PostAsset: %d", status)
	}
	folderID := first.ParentID

	if status, _ := postStoredFile(t, player, map[string]string{"name": "song.ogg", "mime_type": "audio/ogg", "campaign_id": campaignID}, "song"); status != http.StatusForbidden {
		t.Fatalf("a player away from the table posted to the campaign: %d", status)
	}
	seatPlayer(t, campaignID)
	if status, _ := postStoredFile(t, player, map[string]string{"name": "song.ogg", "mime_type": "audio/ogg", "parent_id": folderID}, "song"); status != http.StatusForbidden {
		t.Fatalf("a player wrote into the campaign folder without write on it: %d", status)
	}
	if status, _ := postStoredFile(t, dungeonMaster, map[string]string{"name": "second.png", "mime_type": "image/png", "parent_id": folderID}, "map"); status != http.StatusCreated {
		t.Fatalf("the dungeon master was refused the campaign folder: %d", status)
	}
	status, song := postStoredFile(t, player, map[string]string{"name": "song.ogg", "mime_type": "audio/ogg", "campaign_id": campaignID}, "song")
	if status != http.StatusCreated || song.ParentID != folderID {
		t.Fatalf("a seated player was refused a campaign upload: %d", status)
	}
	if rec := getData(t, dungeonMaster, http.MethodGet, song.ID, nil); rec.Code != http.StatusOK || rec.Body.String() != "song" {
		t.Fatalf("the dungeon master cannot read a player's campaign file: %d", rec.Code)
	}

	status, own := postStoredFile(t, dungeonMaster, map[string]string{"name": "portrait.png", "mime_type": "image/png"}, "face")
	if status != http.StatusCreated {
		t.Fatalf("PostAsset: %d", status)
	}
	if rec := getData(t, player, http.MethodGet, own.ID, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("a member read another player's own file: %d", rec.Code)
	}
	if status, _ := postStoredFile(t, player, map[string]string{"name": "x.png", "mime_type": "image/png", "parent_id": own.ParentID}, "x"); status != http.StatusForbidden {
		t.Fatalf("a player wrote into another player's folder: %d", status)
	}
}

func TestAnAttachmentNeedsReadOnTheAssetAndWriteOnTheRow(t *testing.T) {
	requireBlob(t)
	ensureProfile(t, dungeonMaster, "testy@quillborne.local")
	ensureProfile(t, player, "pip@quillborne.local")
	campaignID := postCampaign(t)
	status, stored := postStoredFile(t, dungeonMaster, map[string]string{"name": "map.png", "mime_type": "image/png", "campaign_id": campaignID}, "map")
	if status != http.StatusCreated {
		t.Fatalf("PostAsset: %d", status)
	}
	params := map[string]string{"id": stored.ID}
	link := `{"object_type":"campaign","object_id":"` + campaignID + `","properties":{"focus":"north"}}`
	listing := "/api/asset/object?object_type=campaign&object_id=" + campaignID

	if status, _ := call(t, player, http.MethodPost, "/api/asset/"+stored.ID+"/object", link, params, handler.PostObjectAsset); status != http.StatusNotFound {
		t.Fatalf("a player attached an asset they cannot read: %d", status)
	}
	seatPlayer(t, campaignID)
	if status, _ := call(t, player, http.MethodPost, "/api/asset/"+stored.ID+"/object", link, params, handler.PostObjectAsset); status != http.StatusForbidden {
		t.Fatalf("a player attached an asset to a row they cannot write: %d", status)
	}
	status, answer := call(t, dungeonMaster, http.MethodPost, "/api/asset/"+stored.ID+"/object", link, params, handler.PostObjectAsset)
	if status != http.StatusCreated {
		t.Fatalf("PostObjectAsset: %d %+v", status, answer.Error)
	}
	linkID := id(t, answer)
	if status, answer := call(t, player, http.MethodGet, listing, "", nil, handler.GetObjectAssets); status != http.StatusOK || !listed(t, answer, linkID) {
		t.Fatalf("a seated player does not read the campaign's attachments: %d", status)
	}
	unlink := map[string]string{"id": stored.ID, "object_id": linkID}
	if status, _ := call(t, player, http.MethodDelete, "/api/asset/"+stored.ID+"/object/"+linkID, "", unlink, handler.DeleteObjectAsset); status != http.StatusForbidden {
		t.Fatalf("a player removed an attachment from a row they cannot write: %d", status)
	}

	status, answer = call(t, player, http.MethodPost, "/api/resource", `{"kind":"entries","name":"Pip's notes"}`, nil, handler.PostResource)
	if status != http.StatusCreated {
		t.Fatalf("PostResource: %d %+v", status, answer.Error)
	}
	page := `{"object_type":"resource","object_id":"` + id(t, answer) + `"}`
	if status, _ := call(t, player, http.MethodPost, "/api/asset/"+stored.ID+"/object", page, params, handler.PostObjectAsset); status != http.StatusCreated {
		t.Fatalf("a player could not attach a readable asset to their own page: %d", status)
	}

	if status, _ := call(t, dungeonMaster, http.MethodDelete, "/api/asset/"+stored.ID+"/object/"+linkID, "", unlink, handler.DeleteObjectAsset); status != http.StatusOK {
		t.Fatalf("DeleteObjectAsset: %d", status)
	}
	if status, answer := call(t, dungeonMaster, http.MethodGet, listing, "", nil, handler.GetObjectAssets); status != http.StatusOK || listed(t, answer, linkID) {
		t.Fatalf("a removed attachment is still listed: %d", status)
	}
}

func TestAnAssetMovesOnlyWithinItsOwnTree(t *testing.T) {
	requireBlob(t)
	ensureProfile(t, dungeonMaster, "testy@quillborne.local")
	status, answer := call(t, dungeonMaster, http.MethodPost, "/api/asset", `{"name":"Maps","mime_type":"inode/directory","type":"folder"}`, nil, handler.PostAsset)
	if status != http.StatusCreated {
		t.Fatalf("PostAsset folder: %d %+v", status, answer.Error)
	}
	folderID := id(t, answer)
	status, stored := postStoredFile(t, dungeonMaster, map[string]string{"name": "coast.png", "mime_type": "image/png"}, "coast")
	if status != http.StatusCreated {
		t.Fatalf("PostAsset: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodPost, "/api/file/move", `{"ids":["`+stored.ID+`"],"target_id":"`+folderID+`"}`, nil, handler.PostAssetMove); status != http.StatusOK {
		t.Fatalf("PostAssetMove: %d", status)
	}
	status, answer = call(t, dungeonMaster, http.MethodGet, "/api/file/"+stored.ID, "", map[string]string{"id": stored.ID}, handler.GetFile)
	var moved storedAsset
	if status != http.StatusOK || json.Unmarshal(answer.Data, &moved) != nil || moved.ParentID != folderID || moved.Path != "user-"+dungeonMaster.String()+"/maps/coast.png" {
		t.Fatalf("the moved file is not in its folder: %d %+v", status, moved)
	}
	if rec := getData(t, dungeonMaster, http.MethodGet, stored.ID, nil); rec.Code != http.StatusOK || rec.Body.String() != "coast" {
		t.Fatalf("a moved file no longer streams: %d", rec.Code)
	}

	campaignID := postCampaign(t)
	status, campaignFile := postStoredFile(t, dungeonMaster, map[string]string{"name": "map.png", "mime_type": "image/png", "campaign_id": campaignID}, "map")
	if status != http.StatusCreated {
		t.Fatalf("PostAsset: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodPost, "/api/file/move", `{"ids":["`+stored.ID+`"],"target_id":"`+campaignFile.ParentID+`"}`, nil, handler.PostAssetMove); status != http.StatusBadRequest {
		t.Fatalf("a file crossed into another folder tree: %d", status)
	}
	if status, _ := call(t, dungeonMaster, http.MethodPost, "/api/file/move", `{"ids":["`+folderID+`"],"target_id":"`+folderID+`"}`, nil, handler.PostAssetMove); status != http.StatusBadRequest {
		t.Fatalf("a folder moved into itself: %d", status)
	}
}

func TestABlockDocumentIsServedAsItsAssetData(t *testing.T) {
	requireStack(t)
	ensureProfile(t, dungeonMaster, "testy@quillborne.local")
	status, answer := call(t, dungeonMaster, http.MethodPost, "/api/asset", `{"name":"Notes","mime_type":"application/vnd.mar.document+json","document":{"blocks":[{"kind":"text","text":"Hail"}]}}`, nil, handler.PostAsset)
	if status != http.StatusCreated {
		t.Fatalf("PostAsset document: %d %+v", status, answer.Error)
	}
	assetID := id(t, answer)
	full := getData(t, dungeonMaster, http.MethodGet, assetID, nil)
	var document struct {
		Blocks []struct {
			Text string `json:"text"`
		} `json:"blocks"`
	}
	if full.Code != http.StatusOK || json.Unmarshal(full.Body.Bytes(), &document) != nil || len(document.Blocks) != 1 || document.Blocks[0].Text != "Hail" {
		t.Fatalf("the document is not served: %d %s", full.Code, full.Body.String())
	}
	digest := sha256.Sum256(full.Body.Bytes())
	etag := `"` + base64.RawURLEncoding.EncodeToString(digest[:]) + `"`
	if full.Header().Get("ETag") != etag || full.Header().Get("Content-Length") != strconv.Itoa(full.Body.Len()) {
		t.Fatalf("the document etag or length is not its served bytes: %v", full.Header())
	}
	if again := getData(t, dungeonMaster, http.MethodGet, assetID, map[string]string{"If-None-Match": etag}); again.Code != http.StatusNotModified {
		t.Fatalf("If-None-Match: %d", again.Code)
	}
	if status, _ := call(t, dungeonMaster, http.MethodPut, "/api/asset/"+assetID, `{"document":{"blocks":[{"kind":"text","text":"Farewell"}]}}`, map[string]string{"id": assetID}, handler.PutAsset); status != http.StatusOK {
		t.Fatalf("PutAsset document: %d", status)
	}
	if changed := getData(t, dungeonMaster, http.MethodGet, assetID, nil); changed.Header().Get("ETag") == etag || !strings.Contains(changed.Body.String(), "Farewell") {
		t.Fatalf("the rewritten document kept its etag: %s", changed.Body.String())
	}
	if status, _ := call(t, dungeonMaster, http.MethodPost, "/api/asset", `{"name":"Bad","mime_type":"application/vnd.mar.document+json","document":"plain text"}`, nil, handler.PostAsset); status != http.StatusBadRequest {
		t.Fatalf("a document that is no block document was stored: %d", status)
	}
}

func TestAFileOverTheLimitIsRefused(t *testing.T) {
	requireBlob(t)
	ensureProfile(t, dungeonMaster, "testy@quillborne.local")
	t.Setenv("FILE_MAX_BYTES", "8")
	if status, _ := postStoredFile(t, dungeonMaster, map[string]string{"name": "long.ogg", "mime_type": "audio/ogg"}, "far more than eight bytes"); status != http.StatusRequestEntityTooLarge {
		t.Fatalf("an oversized file was stored: %d", status)
	}
	body, contentType := getForm(t, map[string]string{"name": "huge.ogg", "mime_type": "audio/ogg"}, bytes.Repeat([]byte("a"), 2<<20))
	if rec := raw(t, dungeonMaster, http.MethodPost, "/api/asset", io.MultiReader(body), map[string]string{"Content-Type": contentType}, nil, handler.PostAsset); rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("a body of unknown length past the limit was read whole: %d", rec.Code)
	}
}

func attach(t *testing.T, actor uuid.UUID, assetID, resourceID string) string {
	t.Helper()
	body := `{"object_type":"resource","object_id":"` + resourceID + `"}`
	status, answer := call(t, actor, http.MethodPost, "/api/asset/"+assetID+"/object", body, map[string]string{"id": assetID}, handler.PostObjectAsset)
	if status != http.StatusCreated {
		t.Fatalf("PostObjectAsset: %d %+v", status, answer.Error)
	}
	return id(t, answer)
}

func TestAPersonalUploadIsNeitherListedNorReadByAnotherMember(t *testing.T) {
	requireBlob(t)
	ensureProfile(t, dungeonMaster, "testy@quillborne.local")
	ensureProfile(t, player, "pip@quillborne.local")
	status, own := postStoredFile(t, player, map[string]string{"name": "diary.png", "mime_type": "image/png"}, "secret")
	if status != http.StatusCreated {
		t.Fatalf("PostAsset: %d", status)
	}
	if rec := getData(t, player, http.MethodGet, own.ID, nil); rec.Code != http.StatusOK {
		t.Fatalf("a player cannot read their own upload: %d", rec.Code)
	}
	if rec := getData(t, dungeonMaster, http.MethodGet, own.ID, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("another member read a personal upload: %d", rec.Code)
	}
	if status, _ := call(t, dungeonMaster, http.MethodGet, "/api/asset/"+own.ParentID, "", map[string]string{"id": own.ParentID}, handler.GetAsset); status != http.StatusNotFound {
		t.Fatalf("another member read a personal folder: %d", status)
	}
	if _, answer := call(t, dungeonMaster, http.MethodGet, "/api/asset", "", nil, handler.GetAssets); listed(t, answer, own.ID) || listed(t, answer, own.ParentID) {
		t.Fatalf("another member listed a personal upload or its folder")
	}
}

func TestAPageSharedWithACampaignSharesTheImageItHolds(t *testing.T) {
	requireBlob(t)
	ensureProfile(t, dungeonMaster, "testy@quillborne.local")
	campaignID := postCampaign(t)
	seatPlayer(t, campaignID)

	for _, side := range []struct{ owner, reader uuid.UUID }{{dungeonMaster, player}, {player, dungeonMaster}} {
		status, image := postStoredFile(t, side.owner, map[string]string{"name": "vale.png", "mime_type": "image/png"}, "vale")
		if status != http.StatusCreated {
			t.Fatalf("PostAsset: %d", status)
		}
		status, made := call(t, side.owner, http.MethodPost, "/api/resource", `{"kind":"locations","name":"The vale"}`, nil, handler.PostResource)
		if status != http.StatusCreated {
			t.Fatalf("PostResource: %d %+v", status, made.Error)
		}
		resourceID := id(t, made)
		params := map[string]string{"id": resourceID}
		attach(t, side.owner, image.ID, resourceID)

		if rec := getData(t, side.reader, http.MethodGet, image.ID, nil); rec.Code != http.StatusNotFound {
			t.Fatalf("the image of an unshared page was read: %d", rec.Code)
		}
		if status, _ := call(t, side.owner, http.MethodPut, "/", `{"share_campaigns":["`+campaignID+`"]}`, params, handler.PutResource); status != http.StatusOK {
			t.Fatalf("PutResource share: %d", status)
		}
		if rec := getData(t, side.reader, http.MethodGet, image.ID, nil); rec.Code != http.StatusOK || rec.Body.String() != "vale" {
			t.Fatalf("the table was refused the image of a page shared with it: %d", rec.Code)
		}
		if status, _ := call(t, side.owner, http.MethodPut, "/", `{"share_campaigns":[]}`, params, handler.PutResource); status != http.StatusOK {
			t.Fatalf("PutResource unshare: %d", status)
		}
		if rec := getData(t, side.reader, http.MethodGet, image.ID, nil); rec.Code != http.StatusNotFound {
			t.Fatalf("the image was still read once its page was unshared: %d", rec.Code)
		}
		if rec := getData(t, side.owner, http.MethodGet, image.ID, nil); rec.Code != http.StatusOK {
			t.Fatalf("the owner lost their own image: %d", rec.Code)
		}
	}
}

func TestAnAssetSharedThroughAClaimIsReadByItsHolders(t *testing.T) {
	requireBlob(t)
	ensureProfile(t, dungeonMaster, "testy@quillborne.local")
	ensureProfile(t, player, "pip@quillborne.local")
	status, own := postStoredFile(t, player, map[string]string{"name": "sketch.png", "mime_type": "image/png"}, "sketch")
	if status != http.StatusCreated {
		t.Fatalf("PostAsset: %d", status)
	}
	status, claim := call(t, player, http.MethodPost, "/api/claim", `{"name":"Sketch readers","access":4}`, nil, handler.PostClaim)
	if status != http.StatusCreated {
		t.Fatalf("PostClaim: %d %+v", status, claim.Error)
	}
	claimID := id(t, claim)
	params := map[string]string{"id": claimID}
	if status, answer := call(t, player, http.MethodPost, "/api/claim/"+claimID+"/object", `{"object_type":"asset","object_id":"`+own.ID+`"}`, params, handler.PostClaimObject); status != http.StatusCreated {
		t.Fatalf("PostClaimObject: %d %+v", status, answer.Error)
	}
	if rec := getData(t, dungeonMaster, http.MethodGet, own.ID, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("a member who holds no claim read the shared asset: %d", rec.Code)
	}
	if status, answer := call(t, player, http.MethodPost, "/api/claim/"+claimID+"/user", `{"user_id":"`+dungeonMaster.String()+`"}`, params, handler.PostClaimUser); status != http.StatusCreated {
		t.Fatalf("PostClaimUser: %d %+v", status, answer.Error)
	}
	if rec := getData(t, dungeonMaster, http.MethodGet, own.ID, nil); rec.Code != http.StatusOK || rec.Body.String() != "sketch" {
		t.Fatalf("the claim's holder was refused the asset: %d", rec.Code)
	}
}

func TestAnImageTakenOffAPageIsNoLongerSharedWithIt(t *testing.T) {
	requireBlob(t)
	ensureProfile(t, dungeonMaster, "testy@quillborne.local")
	campaignID := postCampaign(t)
	seatPlayer(t, campaignID)
	status, image := postStoredFile(t, dungeonMaster, map[string]string{"name": "keep.png", "mime_type": "image/png"}, "keep")
	if status != http.StatusCreated {
		t.Fatalf("PostAsset: %d", status)
	}
	status, made := call(t, dungeonMaster, http.MethodPost, "/api/resource", `{"kind":"locations","name":"The keep"}`, nil, handler.PostResource)
	if status != http.StatusCreated {
		t.Fatalf("PostResource: %d %+v", status, made.Error)
	}
	resourceID := id(t, made)
	if status, _ := call(t, dungeonMaster, http.MethodPut, "/", `{"share_campaigns":["`+campaignID+`"]}`, map[string]string{"id": resourceID}, handler.PutResource); status != http.StatusOK {
		t.Fatalf("PutResource share: %d", status)
	}
	linkID := attach(t, dungeonMaster, image.ID, resourceID)
	if rec := getData(t, player, http.MethodGet, image.ID, nil); rec.Code != http.StatusOK {
		t.Fatalf("an image attached to a shared page was refused to its table: %d", rec.Code)
	}
	unlink := map[string]string{"id": image.ID, "object_id": linkID}
	if status, _ := call(t, dungeonMaster, http.MethodDelete, "/api/asset/"+image.ID+"/object/"+linkID, "", unlink, handler.DeleteObjectAsset); status != http.StatusOK {
		t.Fatalf("DeleteObjectAsset: %d", status)
	}
	if status, answer := call(t, dungeonMaster, http.MethodGet, "/api/asset/object?object_type=resource&object_id="+resourceID, "", nil, handler.GetObjectAssets); status != http.StatusOK || listed(t, answer, linkID) {
		t.Fatalf("the detached image is still listed on the page: %d", status)
	}
	if rec := getData(t, player, http.MethodGet, image.ID, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("an image taken off a shared page was still read by its table: %d", rec.Code)
	}
}

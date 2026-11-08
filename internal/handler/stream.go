package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/SlyOtis/quillborne/internal/broker"
	"github.com/SlyOtis/quillborne/internal/db"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	sdb "github.com/nimling/samna-auth-middleware/v2/disciple/sdb"
)

const (
	streamRetry     = 5 * time.Second
	streamHeartbeat = 20 * time.Second
)

var streamEventID atomic.Int64

var campaignPartTypes = map[string]string{
	broker.KindChat:      db.OBJECT_TYPE_CHAT_ENTRY,
	broker.KindMap:       db.OBJECT_TYPE_CAMPAIGN_MAP,
	broker.KindEncounter: db.OBJECT_TYPE_ENCOUNTER,
	broker.KindSong:      db.OBJECT_TYPE_SONG,
	broker.KindCharacter: db.OBJECT_TYPE_CHARACTER,
	broker.KindVehicle:   db.OBJECT_TYPE_VEHICLE,
}

type streamEvent struct {
	Kind string `json:"kind"`
	Op   string `json:"op"`
	ID   string `json:"id"`
}

func GetCampaignStream(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return ctx.String(http.StatusUnauthorized, "Unauthorized")
	}
	campaignID, ok := getUUID(ctx.Param("id"))
	if !ok {
		return ctx.String(http.StatusBadRequest, "Invalid id, expected UUID")
	}
	if status, message := getReadAccess(ctx.Request().Context(), actorID, campaignID, db.OBJECT_TYPE_CAMPAIGN); status != 0 {
		return ctx.String(status, message)
	}
	return getStream(ctx, broker.CampaignTopic(campaignID), func(rctx context.Context, ev broker.Event) bool {
		if status, _ := getReadAccess(rctx, actorID, campaignID, db.OBJECT_TYPE_CAMPAIGN); status != 0 {
			return false
		}
		objectType, known := campaignPartTypes[ev.Kind]
		if !known {
			return false
		}
		if ev.Op == broker.OpDelete {
			return true
		}
		id, err := uuid.Parse(ev.ID)
		if err != nil {
			return false
		}
		status, _ := getReadAccess(rctx, actorID, id, objectType)
		return status == 0
	})
}

func GetProfileStream(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return ctx.String(http.StatusUnauthorized, "Unauthorized")
	}
	return getStream(ctx, broker.ProfileTopic(actorID), func(context.Context, broker.Event) bool {
		return true
	})
}

func GetResourceStream(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return ctx.String(http.StatusUnauthorized, "Unauthorized")
	}
	resourceID, ok := getUUID(ctx.Param("id"))
	if !ok {
		return ctx.String(http.StatusBadRequest, "Invalid id, expected UUID")
	}
	if status, message := getReadAccess(ctx.Request().Context(), actorID, resourceID, db.OBJECT_TYPE_RESOURCE); status != 0 {
		return ctx.String(status, message)
	}
	return getStream(ctx, broker.ResourceTopic(resourceID), func(rctx context.Context, _ broker.Event) bool {
		status, _ := getReadAccess(rctx, actorID, resourceID, db.OBJECT_TYPE_RESOURCE)
		return status == 0
	})
}

func GetCharacterStream(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return ctx.String(http.StatusUnauthorized, "Unauthorized")
	}
	characterID, ok := getUUID(ctx.Param("id"))
	if !ok {
		return ctx.String(http.StatusBadRequest, "Invalid id, expected UUID")
	}
	if status, message := getReadAccess(ctx.Request().Context(), actorID, characterID, db.OBJECT_TYPE_CHARACTER); status != 0 {
		return ctx.String(status, message)
	}
	return getStream(ctx, broker.CharacterTopic(characterID), func(rctx context.Context, ev broker.Event) bool {
		if ev.Op == broker.OpDelete {
			return true
		}
		status, _ := getReadAccess(rctx, actorID, characterID, db.OBJECT_TYPE_CHARACTER)
		return status == 0
	})
}

func GetVehicleStream(ctx echo.Context) error {
	actorID, ok := ctx.Get("user_id").(uuid.UUID)
	if !ok {
		return ctx.String(http.StatusUnauthorized, "Unauthorized")
	}
	vehicleID, ok := getUUID(ctx.Param("id"))
	if !ok {
		return ctx.String(http.StatusBadRequest, "Invalid id, expected UUID")
	}
	if status, message := getReadAccess(ctx.Request().Context(), actorID, vehicleID, db.OBJECT_TYPE_VEHICLE); status != 0 {
		return ctx.String(status, message)
	}
	return getStream(ctx, broker.VehicleTopic(vehicleID), func(rctx context.Context, ev broker.Event) bool {
		if ev.Op == broker.OpDelete {
			return true
		}
		status, _ := getReadAccess(rctx, actorID, vehicleID, db.OBJECT_TYPE_VEHICLE)
		return status == 0
	})
}

func getReadAccess(ctx context.Context, actorID, objectID uuid.UUID, objectType string) (int, string) {
	if _, err := sdb.Instance().MutationAccess(ctx, actorID, objectID, objectType, sdb.ACCESS_READ); err != nil {
		if errors.Is(err, sdb.ErrNotFound) {
			return http.StatusNotFound, "Not found"
		}
		return http.StatusForbidden, "Forbidden"
	}
	return 0, ""
}

func getStream(ctx echo.Context, topic string, allowed func(context.Context, broker.Event) bool) error {
	b := broker.Instance()
	if b == nil {
		return ctx.String(http.StatusServiceUnavailable, "Live updates are not running")
	}
	res := ctx.Response()
	flusher, ok := res.Writer.(http.Flusher)
	if !ok {
		return ctx.String(http.StatusInternalServerError, "Streaming unsupported")
	}
	events, release := b.Get(topic)
	defer release()

	res.Header().Set(echo.HeaderContentType, "text/event-stream")
	res.Header().Set("Cache-Control", "no-cache")
	res.Header().Set("X-Accel-Buffering", "no")
	res.WriteHeader(http.StatusOK)
	if _, err := fmt.Fprintf(res, "retry: %d\n\n", streamRetry.Milliseconds()); err != nil {
		return nil
	}
	flusher.Flush()

	rctx := ctx.Request().Context()
	heartbeat := time.NewTicker(streamHeartbeat)
	defer heartbeat.Stop()
	for {
		select {
		case <-rctx.Done():
			return nil
		case <-heartbeat.C:
			if _, err := fmt.Fprint(res, ": beat\n\n"); err != nil {
				return nil
			}
			flusher.Flush()
		case ev := <-events:
			if !allowed(rctx, ev) {
				continue
			}
			raw, err := json.Marshal(streamEvent{Kind: ev.Kind, Op: ev.Op, ID: ev.ID})
			if err != nil {
				continue
			}
			streamEventID.CompareAndSwap(0, time.Now().UnixNano())
			if _, err := fmt.Fprintf(res, "id: %d\nevent: %s\ndata: %s\n\n", streamEventID.Add(1), ev.Kind, raw); err != nil {
				return nil
			}
			flusher.Flush()
		}
	}
}

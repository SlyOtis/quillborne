package handler

import (
	"context"
	"errors"
	"os"

	"github.com/SlyOtis/quillborne/internal/db"
	"github.com/google/uuid"
	sdb "github.com/nimling/samna-auth-middleware/v2/disciple/sdb"
	"github.com/uptrace/bun"
)

var errNoOwner = errors.New("SERVER_OWNER_ID is not a UUID")

type Writer struct {
	ActorID uuid.UUID
	OwnerID uuid.UUID
	Access  *sdb.AccessClaim
}

func postWriter(ctx context.Context, actorID uuid.UUID) (*Writer, error) {
	ownerID, err := uuid.Parse(os.Getenv("SERVER_OWNER_ID"))
	if err != nil {
		return nil, errNoOwner
	}
	ac, err := sdb.Instance().MutationAccess(ctx, actorID, ownerID, sdb.OBJECT_TYPE_ORGANIZATION, sdb.ACCESS_EXECUTE)
	if err != nil {
		return nil, err
	}
	if ac == nil || ac.UserClaimID == nil || ac.ClaimID == nil {
		return nil, sdb.ErrNoAccess
	}
	stamp := *ac
	stamp.OwnerID = ownerID
	return &Writer{ActorID: actorID, OwnerID: ownerID, Access: &stamp}, nil
}

func postOwnerBinding(ctx context.Context, tx bun.Tx, w *Writer, objectType string, objectID uuid.UUID, access sdb.ClaimAccess) error {
	t := sdb.ObjectType(objectType)
	binding := sdb.ClaimObject{
		ClaimID:    *w.Access.ClaimID,
		ObjectID:   &objectID,
		ObjectType: &t,
		Access:     &access,
		OwnerID:    w.OwnerID,
		RootID:     w.Access.RootID,
		CreatedBy:  w.Access.UserClaimID,
		Inherits:   true,
	}
	return sdb.Instance().NewInsert().Model(&binding).Access(w.Access).Conn(tx).Scan(ctx, &binding)
}

func postClaim(ctx context.Context, tx bun.Tx, w *Writer, name, description string, access sdb.ClaimAccess) (uuid.UUID, error) {
	claim := sdb.Claim{
		Name:        name,
		Description: &description,
		Access:      access,
		Inherits:    false,
		Type:        sdb.CLAIM_TYPE_USER,
		OwnerID:     w.OwnerID,
	}
	if err := sdb.Instance().NewInsert().Model(&claim).Access(w.Access).Conn(tx).Scan(ctx, &claim); err != nil {
		return uuid.Nil, err
	}
	return claim.ID, nil
}

func putBindings(ctx context.Context, tx bun.Tx, w *Writer, objectType string, objectID uuid.UUID, want map[uuid.UUID]sdb.ClaimAccess, managed []uuid.UUID) error {
	if len(managed) > 0 {
		existing, err := sdb.Instance().GetBindings(ctx, sdb.BindingFilters{
			ObjectType: sdb.ObjectType(objectType),
			ObjectIDs:  []uuid.UUID{objectID},
			ClaimIDs:   managed,
		})
		if err != nil {
			return err
		}
		for _, binding := range existing {
			if binding.DeletedAt != nil {
				continue
			}
			access, wanted := want[binding.ClaimID]
			if wanted && binding.Access != nil && *binding.Access == access {
				delete(want, binding.ClaimID)
				continue
			}
			gone := sdb.ClaimObject{ID: binding.ID, ClaimID: binding.ClaimID}
			if err := sdb.Instance().NewDelete().Model(&gone).Access(w.Access).Conn(tx).Scan(ctx, &gone); err != nil {
				return err
			}
		}
	}
	t := sdb.ObjectType(objectType)
	for claimID, access := range want {
		a := access
		binding := sdb.ClaimObject{
			ClaimID:    claimID,
			ObjectID:   &objectID,
			ObjectType: &t,
			Access:     &a,
			OwnerID:    w.OwnerID,
			RootID:     w.Access.RootID,
			CreatedBy:  w.Access.UserClaimID,
			Inherits:   true,
		}
		if err := sdb.Instance().NewInsert().Model(&binding).Access(w.Access).Conn(tx).Scan(ctx, &binding); err != nil {
			return err
		}
	}
	return nil
}

func getHolders(ctx context.Context, claimID *uuid.UUID) ([]uuid.UUID, error) {
	holders := make([]uuid.UUID, 0)
	if claimID == nil {
		return holders, nil
	}
	grants, err := sdb.Instance().GetGrants(ctx, sdb.GrantFilters{ClaimIDs: []uuid.UUID{*claimID}, NoClients: true})
	if err != nil {
		return nil, err
	}
	for _, grant := range grants {
		if grant.DeletedAt == nil {
			holders = append(holders, grant.UserID)
		}
	}
	return holders, nil
}

func putGrants(ctx context.Context, tx bun.Tx, w *Writer, claimID uuid.UUID, users []uuid.UUID) error {
	grants, err := sdb.Instance().GetGrants(ctx, sdb.GrantFilters{ClaimIDs: []uuid.UUID{claimID}, NoClients: true})
	if err != nil {
		return err
	}
	want := map[uuid.UUID]bool{}
	for _, user := range users {
		want[user] = true
	}
	for _, grant := range grants {
		if grant.DeletedAt != nil {
			continue
		}
		if want[grant.UserID] {
			delete(want, grant.UserID)
			continue
		}
		gone := sdb.UserClaim{ID: grant.ID, ClaimID: claimID}
		if err := sdb.Instance().NewDelete().Model(&gone).Access(w.Access).Conn(tx).Scan(ctx, &gone); err != nil {
			return err
		}
	}
	for user := range want {
		grant := sdb.UserClaim{ClaimID: claimID, UserID: user}
		if err := sdb.Instance().NewInsert().Model(&grant).Access(w.Access).Conn(tx).Scan(ctx, &grant); err != nil {
			return err
		}
	}
	return nil
}

func postGrant(ctx context.Context, tx bun.Tx, w *Writer, claimID, userID uuid.UUID) (uuid.UUID, error) {
	grant := sdb.UserClaim{ClaimID: claimID, UserID: userID}
	err := sdb.Instance().NewInsert().Model(&grant).Access(w.Access).Conn(tx).Scan(ctx, &grant)
	return grant.ID, err
}

func deleteGrant(ctx context.Context, tx bun.Tx, w *Writer, claimID, userID uuid.UUID) error {
	grants, err := sdb.Instance().GetGrants(ctx, sdb.GrantFilters{ClaimIDs: []uuid.UUID{claimID}, UserIDs: []uuid.UUID{userID}, NoClients: true})
	if err != nil {
		return err
	}
	for _, grant := range grants {
		if grant.DeletedAt != nil {
			continue
		}
		gone := sdb.UserClaim{ID: grant.ID, ClaimID: claimID}
		if err := sdb.Instance().NewDelete().Model(&gone).Access(w.Access).Conn(tx).Scan(ctx, &gone); err != nil {
			return err
		}
	}
	return nil
}

func putShare(ctx context.Context, tx bun.Tx, w *Writer, objectType string, objectID uuid.UUID, share *db.Share, fixed map[uuid.UUID]sdb.ClaimAccess, fixedManaged []uuid.UUID) error {
	want := map[uuid.UUID]sdb.ClaimAccess{}
	managed := append([]uuid.UUID{}, fixedManaged...)
	for claimID, access := range fixed {
		want[claimID] = access
	}
	read := sdb.ACCESS_READ
	if len(share.ShareCampaigns) > 0 {
		campaigns := make([]db.Campaign, 0)
		if err := tx.NewSelect().Model(&campaigns).Where("id IN (?)", bun.In(share.ShareCampaigns)).Scan(ctx); err != nil {
			return err
		}
		for _, campaign := range campaigns {
			for _, claimID := range []*uuid.UUID{campaign.DmClaimID, campaign.PlayerClaimID} {
				if claimID == nil {
					continue
				}
				managed = append(managed, *claimID)
				want[*claimID] = want[*claimID] | read
			}
		}
	}
	if share.ReaderClaimID == nil && len(share.ShareUsers) > 0 {
		claimID, err := postClaim(ctx, tx, w, "Readers", "Read on one shared page", sdb.ACCESS_READ)
		if err != nil {
			return err
		}
		share.ReaderClaimID = &claimID
		if _, err := tx.NewUpdate().Table(objectTypeTable(objectType)).Set("reader_claim_id = ?", claimID).Where("id = ?", objectID).Exec(ctx); err != nil {
			return err
		}
	}
	if share.ReaderClaimID != nil {
		managed = append(managed, *share.ReaderClaimID)
		if len(share.ShareUsers) > 0 {
			want[*share.ReaderClaimID] = want[*share.ReaderClaimID] | read
		}
		if err := putGrants(ctx, tx, w, *share.ReaderClaimID, share.ShareUsers); err != nil {
			return err
		}
	}
	previous := make([]uuid.UUID, 0)
	if err := tx.NewRaw("SELECT unnest(share_campaigns) FROM ? WHERE id = ?", bun.Ident(objectTypeTable(objectType)), objectID).Scan(ctx, &previous); err == nil {
		campaigns := make([]db.Campaign, 0)
		if len(previous) > 0 {
			if err := tx.NewSelect().Model(&campaigns).Where("id IN (?)", bun.In(previous)).Scan(ctx); err != nil {
				return err
			}
		}
		for _, campaign := range campaigns {
			for _, claimID := range []*uuid.UUID{campaign.DmClaimID, campaign.PlayerClaimID} {
				if claimID != nil {
					managed = append(managed, *claimID)
				}
			}
		}
	}
	page := map[uuid.UUID]sdb.ClaimAccess{}
	for claimID, access := range want {
		page[claimID] = access
	}
	if err := putBindings(ctx, tx, w, objectType, objectID, want, managed); err != nil {
		return err
	}
	if objectType != db.OBJECT_TYPE_RESOURCE {
		return nil
	}
	attached := make([]uuid.UUID, 0)
	if err := tx.NewSelect().Model((*db.ObjectAsset)(nil)).Column("asset_id").
		Where("object_id = ?", objectID).
		Where("object_type IN (?)", bun.In([]string{"resource", db.OBJECT_TYPE_RESOURCE})).
		Scan(ctx, &attached); err != nil {
		return err
	}
	for _, assetID := range attached {
		if err := putAssetShare(ctx, tx, w, assetID, objectType, objectID, page, managed); err != nil {
			return err
		}
	}
	return nil
}

func objectTypeTable(objectType string) string {
	switch objectType {
	case db.OBJECT_TYPE_RESOURCE:
		return "resource"
	case db.OBJECT_TYPE_SONG:
		return "song"
	case db.OBJECT_TYPE_ENCOUNTER:
		return "encounter"
	}
	return ""
}

func getPageShare(ctx context.Context, objectType string, objectIDs []uuid.UUID) (map[uuid.UUID]sdb.ClaimAccess, error) {
	shared := map[uuid.UUID]sdb.ClaimAccess{}
	if len(objectIDs) == 0 {
		return shared, nil
	}
	if objectType == db.OBJECT_TYPE_CAMPAIGN {
		campaigns := make([]db.Campaign, 0)
		if err := db.Instance().NewSelect().Model(&campaigns).Column("dm_claim_id", "player_claim_id").Where("id IN (?)", bun.In(objectIDs)).Scan(ctx); err != nil {
			return nil, err
		}
		for _, campaign := range campaigns {
			if campaign.DmClaimID != nil {
				shared[*campaign.DmClaimID] = shared[*campaign.DmClaimID] | sdb.ACCESS_ALL
			}
			if campaign.PlayerClaimID != nil {
				shared[*campaign.PlayerClaimID] = shared[*campaign.PlayerClaimID] | sdb.ACCESS_READ
			}
		}
		return shared, nil
	}
	bindings, err := sdb.Instance().GetBindings(ctx, sdb.BindingFilters{ObjectType: db.OBJECT_TYPE_RESOURCE, ObjectIDs: objectIDs})
	if err != nil {
		return nil, err
	}
	for _, binding := range bindings {
		if binding.DeletedAt == nil && binding.Access != nil && *binding.Access&sdb.ACCESS_READ != 0 {
			shared[binding.ClaimID] = shared[binding.ClaimID] | sdb.ACCESS_READ
		}
	}
	return shared, nil
}

func putAssetShare(ctx context.Context, tx bun.Tx, w *Writer, assetID uuid.UUID, objectType string, objectID uuid.UUID, page map[uuid.UUID]sdb.ClaimAccess, managed []uuid.UUID) error {
	asset := db.Asset{ID: assetID}
	if err := tx.NewSelect().Model(&asset).Column("id", "sa_parent_id", "uploaded_by").WherePK().Scan(ctx); err != nil {
		return err
	}
	if asset.UploadedBy != w.ActorID || asset.ParentID == uuid.Nil || asset.ParentID == asset.ID {
		return nil
	}
	folder, err := sdb.Instance().GetBindings(ctx, sdb.BindingFilters{ObjectType: db.OBJECT_TYPE_ASSET, ObjectIDs: []uuid.UUID{asset.ParentID}})
	if err != nil {
		return err
	}
	want := map[uuid.UUID]sdb.ClaimAccess{}
	for _, binding := range folder {
		if binding.DeletedAt == nil && binding.Access != nil {
			want[binding.ClaimID] = *binding.Access
		}
	}
	others := make([]db.ObjectAsset, 0)
	if err := tx.NewSelect().Model(&others).Column("object_id", "object_type").
		Where("asset_id = ?", assetID).
		Where("object_id <> ?", objectID).
		Where("object_type IN (?)", bun.In([]string{"resource", db.OBJECT_TYPE_RESOURCE, "campaign", db.OBJECT_TYPE_CAMPAIGN})).
		Scan(ctx); err != nil {
		return err
	}
	elsewhere := map[string][]uuid.UUID{}
	for _, other := range others {
		table, _ := getObjectTable(other.ObjectType)
		elsewhere[table] = append(elsewhere[table], other.ObjectID)
	}
	for claimID, access := range page {
		want[claimID] = want[claimID] | access
	}
	for table, ids := range elsewhere {
		shared, err := getPageShare(ctx, table, ids)
		if err != nil {
			return err
		}
		for claimID, access := range shared {
			want[claimID] = want[claimID] | access
		}
	}
	reach := append([]uuid.UUID{}, managed...)
	for claimID := range want {
		reach = append(reach, claimID)
	}
	return putBindings(ctx, tx, w, db.OBJECT_TYPE_ASSET, assetID, want, reach)
}

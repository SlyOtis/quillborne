package broker

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/driver/pgdriver"
)

const (
	Channel   = "quillborne_event"
	queueSize = 64
)

const (
	KindChat      = "chat"
	KindMap       = "map"
	KindEncounter = "encounter"
	KindSong      = "song"
	KindProfile   = "profile"
	KindUpdate    = "update"
	KindCharacter = "character"
	KindVehicle   = "vehicle"
)

const (
	OpCreate = "create"
	OpUpdate = "update"
	OpDelete = "delete"
	opReady  = "ready"
)

const (
	readyEvery   = 50 * time.Millisecond
	readyTimeout = 10 * time.Second
)

type Event struct {
	Topic  string `json:"topic"`
	Kind   string `json:"kind"`
	ID     string `json:"id"`
	Op     string `json:"op"`
	Origin string `json:"origin"`
}

func CampaignTopic(id uuid.UUID) string {
	return "campaign:" + id.String()
}

func ProfileTopic(userID uuid.UUID) string {
	return "profile:" + userID.String()
}

func ResourceTopic(id uuid.UUID) string {
	return "resource:" + id.String()
}

func CharacterTopic(id uuid.UUID) string {
	return "character:" + id.String()
}

func VehicleTopic(id uuid.UUID) string {
	return "vehicle:" + id.String()
}

type Broker struct {
	db       *bun.DB
	origin   string
	listener *pgdriver.Listener
	mu       sync.Mutex
	watches  map[string]map[chan Event]struct{}
	done     chan struct{}
	ready    chan struct{}
	readied  sync.Once
}

var instance *Broker

func New(ctx context.Context, db *bun.DB) (*Broker, error) {
	listener := pgdriver.NewListener(db)
	if err := listener.Listen(ctx, Channel); err != nil {
		_ = listener.Close()
		return nil, err
	}
	b := &Broker{db: db, origin: uuid.NewString(), listener: listener, watches: map[string]map[chan Event]struct{}{}, done: make(chan struct{}), ready: make(chan struct{})}
	go b.receive(listener.Channel())
	if err := b.getReady(ctx); err != nil {
		_ = b.Close()
		return nil, err
	}
	return b, nil
}

func (b *Broker) getReady(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, readyTimeout)
	defer cancel()
	raw, err := json.Marshal(Event{Op: opReady, Origin: b.origin})
	if err != nil {
		return err
	}
	tick := time.NewTicker(readyEvery)
	defer tick.Stop()
	for {
		if err := pgdriver.Notify(ctx, b.db, Channel, string(raw)); err != nil {
			return err
		}
		select {
		case <-b.ready:
			return nil
		case <-ctx.Done():
			return ctx.Err()
		case <-tick.C:
		}
	}
}

func Init(ctx context.Context, db *bun.DB) error {
	b, err := New(ctx, db)
	if err != nil {
		return err
	}
	instance = b
	return nil
}

func Instance() *Broker {
	return instance
}

func Post(ctx context.Context, topic, kind, id, op string) {
	if instance == nil {
		return
	}
	instance.Post(ctx, Event{Topic: topic, Kind: kind, ID: id, Op: op})
}

func (b *Broker) Post(ctx context.Context, ev Event) {
	ev.Origin = b.origin
	b.put(ev)
	raw, err := json.Marshal(ev)
	if err != nil {
		return
	}
	if err := pgdriver.Notify(ctx, b.db, Channel, string(raw)); err != nil {
		slog.ErrorContext(ctx, "broker notify", "error", err)
	}
}

func (b *Broker) Get(topic string) (<-chan Event, func()) {
	watch := make(chan Event, queueSize)
	b.mu.Lock()
	if b.watches[topic] == nil {
		b.watches[topic] = map[chan Event]struct{}{}
	}
	b.watches[topic][watch] = struct{}{}
	b.mu.Unlock()
	return watch, func() {
		b.mu.Lock()
		delete(b.watches[topic], watch)
		if len(b.watches[topic]) == 0 {
			delete(b.watches, topic)
		}
		b.mu.Unlock()
	}
}

func (b *Broker) Close() error {
	err := b.listener.Close()
	<-b.done
	return err
}

func (b *Broker) receive(notifications <-chan pgdriver.Notification) {
	defer close(b.done)
	for n := range notifications {
		var ev Event
		if err := json.Unmarshal([]byte(n.Payload), &ev); err != nil {
			continue
		}
		if ev.Origin == b.origin {
			if ev.Op == opReady {
				b.readied.Do(func() { close(b.ready) })
			}
			continue
		}
		if ev.Op == opReady {
			continue
		}
		b.put(ev)
	}
}

func (b *Broker) put(ev Event) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for watch := range b.watches[ev.Topic] {
		select {
		case watch <- ev:
		default:
		}
	}
}

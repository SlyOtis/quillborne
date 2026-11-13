package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/SlyOtis/quillborne/internal/broker"
	"github.com/SlyOtis/quillborne/internal/db"
	"github.com/SlyOtis/quillborne/internal/handler"
	"github.com/SlyOtis/quillborne/internal/qubo"
	"github.com/SlyOtis/quillborne/internal/state"
	"github.com/SlyOtis/quillborne/internal/storage"
	"github.com/SlyOtis/quillborne/internal/version"
	"github.com/joho/godotenv"
	"github.com/labstack/echo/v4"
	em "github.com/labstack/echo/v4/middleware"
	"github.com/labstack/gommon/log"
	"github.com/nimling/nimtel"
	saecho "github.com/nimling/samna-auth-middleware/v2/disciple/echo"
	sam "github.com/nimling/samna-auth-middleware/v2/disciple/sam"
	sdb "github.com/nimling/samna-auth-middleware/v2/disciple/sdb"
	smw "github.com/nimling/samna-auth-middleware/v2/smw"
	"github.com/nimling/samna-auth-middleware/v2/uptime"
)

func main() {
	_ = godotenv.Overload(".env")

	if version.Version == "dev" && os.Getenv("SERVER_VERSION") != "" {
		version.Version = os.Getenv("SERVER_VERSION")
	}

	serverPort := os.Getenv("SERVER_PORT")
	if serverPort == "" {
		serverPort = "4290"
	}
	htmlPath := os.Getenv("SERVER_HTML_PATH")
	if htmlPath == "" {
		htmlPath = "./web/dist"
	}
	allowedOrigins := os.Getenv("SERVER_ALLOWED_ORIGINS")
	if allowedOrigins == "" {
		allowedOrigins = "http://localhost:5173,http://localhost:" + serverPort
	}

	e := echo.New()
	e.HideBanner = true
	e.HidePort = true

	switch strings.ToLower(os.Getenv("SERVER_LOG_LEVEL")) {
	case "debug":
		e.Logger.SetLevel(log.DEBUG)
	case "warn":
		e.Logger.SetLevel(log.WARN)
	case "error":
		e.Logger.SetLevel(log.ERROR)
	default:
		e.Logger.SetLevel(log.INFO)
	}

	shutdownTelemetry, err := nimtel.Init(context.Background(), nimtel.Config{
		ServiceName:    os.Getenv("SAUTH_APP_SLUG"),
		ServiceVersion: version.Version,
		Environment:    os.Getenv("SERVER_ENVIRONMENT"),
		Debug:          strings.EqualFold(os.Getenv("SERVER_LOG_LEVEL"), "debug"),
	})
	if err != nil {
		e.Logger.Fatalf("init telemetry: %v", err)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := shutdownTelemetry(ctx); err != nil {
			slog.Error("telemetry shutdown", "error", err)
		}
	}()

	if err := db.Init(e.Logger); err != nil {
		e.Logger.Fatalf("init postgres: %v", err)
	}
	if _, err := sdb.Init(e.Logger); err != nil {
		e.Logger.Fatalf("samna auth db init: %v", err)
	}
	if err := broker.Init(context.Background(), db.Instance().DB); err != nil {
		e.Logger.Fatalf("init broker: %v", err)
	}
	if err := storage.Init(context.Background()); err != nil {
		e.Logger.Fatalf("init storage: %v", err)
	}

	e.Use(smw.TelemetryMiddleware())
	e.Use(em.Logger())
	e.Use(em.Recover())
	e.Use(em.RequestID())
	e.Use(em.CORSWithConfig(em.CORSConfig{
		AllowOrigins:     strings.Split(allowedOrigins, ","),
		AllowMethods:     []string{echo.GET, echo.PUT, echo.POST, echo.DELETE, echo.PATCH},
		AllowHeaders:     []string{"Authorization", "Content-Type", "Accept"},
		AllowCredentials: true,
	}))

	sam.RegisterStatus(e.Group(uptime.StatusBasePath))

	userAuth := smw.UserAuthMiddleware(nil)

	api := e.Group("/api")
	{
		status := api.Group("/status")
		status.GET("/health/liveness", handler.GetHealthLiveness)
		status.GET("/health/readiness", handler.GetHealthReadiness)
		status.GET("/version", handler.GetVersion)

		auth := api.Group("/auth")
		auth.GET("/login", saecho.GetLogin)
		auth.GET("/callback", saecho.GetCallback)
		auth.GET("/logout", saecho.GetLogout)
		sam.RegisterCli(auth)

		me := auth.Group("/me", userAuth)
		me.GET("", saecho.GetMe)
		me.PUT("", saecho.PutMe)
		me.PATCH("", saecho.PatchMe)
		me.GET("/claim", saecho.GetMeClaims)
		me.GET("/organization", saecho.GetMeOrganizations)

		handler.PutRoutes(api, userAuth)
	}

	if err := state.Register(e, userAuth, version.Version, qubo.Table().Operations()); err != nil {
		e.Logger.Fatalf("state: %v", err)
	}

	e.GET("/*", handler.GetHTML(htmlPath))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	runCtx, cancelRun := context.WithCancel(context.Background())
	defer cancelRun()

	if err := sam.Init(runCtx); err != nil {
		e.Logger.Fatalf("sync init: %v", err)
	}

	server := &http.Server{Addr: ":" + serverPort, Handler: e, ReadHeaderTimeout: 30 * time.Second}
	e.Logger.Infof("quillborne %s on port %s", version.Version, serverPort)
	go func() {
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server stopped", "error", err)
			stop()
		}
	}()
	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		slog.Error("server shutdown", "error", err)
	}
	cancelRun()
	<-sam.Done()
	if err := broker.Instance().Close(); err != nil {
		slog.Error("close broker", "error", err)
	}
	if err := db.Instance().Close(); err != nil {
		slog.Error("close database", "error", err)
	}
	if err := sdb.Instance().Close(); err != nil {
		slog.Error("close samna auth database", "error", err)
	}
}

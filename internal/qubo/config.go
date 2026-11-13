package qubo

import (
	"github.com/nimling/nimbody/cli"
)

var settings = &cli.Settings{Name: cliName, Prefix: "QUBO_", Keys: []cli.Setting{
	{Key: cli.KeyEndpoint, Env: envEndpoint, Flag: "endpoint"},
	{Key: cli.KeyAppSlug, Env: envAppSlug, Flag: "app"},
	{Key: cli.KeyClientID, Env: envClientID, Flag: "client-id"},
	{Key: cli.KeyClientSecret, Env: envClientSecret, Secret: true},
}}

var configCmd = settings.ConfigCommand()

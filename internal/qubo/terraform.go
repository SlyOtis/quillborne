package qubo

import (
	_ "embed"
	"encoding/json"

	"github.com/nimling/nimbody/cli"
	nstate "github.com/nimling/nimbody/state"
	"github.com/nimling/nimbody/terraform"
)

//go:embed state.json
var StateDocument []byte

func registerProvider() {
	var document nstate.Document
	if err := json.Unmarshal(StateDocument, &document); err != nil {
		panic("qubo: state.json: " + err.Error())
	}
	document.Version = cli.GetVersion()
	terraform.Register(rootCmd, terraform.Provider{Name: cliName, Version: cli.GetVersion, Client: client, Document: document})
}

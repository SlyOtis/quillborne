package qubo

import (
	"github.com/nimling/nimbody/cli"
)

var stateCmd = cli.StateCommand(client.Send, &output)

package qubo

import (
	"github.com/nimling/nimbody/cli"
)

var mcpCmd = cli.MCPCommand(rootCmd, pluginName, cli.GetVersion)

func init() {
	mcpCmd.Long = `Serve the tools over the model context protocol on stdio. The qubo plugin starts it; qubo plugin
install installs that. With a login, or a token in QUBO_TOKEN, it relays stdio to the service's own /mcp
with that bearer, so every tool is the service's operation, its route and its tool in one definition,
running the same claims as the route. With a client credential pair, or no endpoint, it serves every
resource command itself: a tool runs this binary with the arguments and flags it is given, so it reads
the same configs, local .qubo/config.yaml and environment as a terminal in the directory claude was
started in, and names itself qubo/<version> (mcp) in User-Agent on every api call where a terminal
sends qubo/<version>. token is not served, so no access token reaches the model.`
}

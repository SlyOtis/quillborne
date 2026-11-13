package qubo

import (
	"github.com/nimling/nimbody/cli"
)

const pluginName = "qubo"

var pluginCmd = cli.PluginCommand(cli.Plugin{
	Name:        pluginName,
	Owner:       "slytech",
	Description: "Drive Quillborne from any repo: the qubo skill and an mcp server exposing every resource command as a tool.",
	Skill:       SkillDocument,
	Version:     cli.GetVersion,
})

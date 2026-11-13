package qubo

import (
	_ "embed"

	"github.com/nimling/nimbody/cli"
)

//go:embed skill/SKILL.md
var SkillDocument string

var skillCmd = cli.SkillCommand(pluginName, SkillDocument)

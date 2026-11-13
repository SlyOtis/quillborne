package qubo

import (
	"github.com/nimling/nimbody/cli"
	"github.com/spf13/cobra"
)

const (
	groupResource = "resource"
	groupTool     = "tool"
)

const bannerArt = `   __ _ _   _| |__   ___
  / _` + "`" + ` | | | | '_ \ / _ \
 | (_| | |_| | |_) | (_) |
  \__, |\__,_|_.__/ \___/
     |_|  quillborne cli
`

var (
	output cli.Output

	client = &cli.Client{
		Settings:     settings,
		Product:      "quillborne",
		Version:      cli.GetVersion,
		LoginPath:    loginPath,
		TokenPath:    cliTokenPath,
		RevokePath:   cliRevokePath,
		IdentityPath: mePath,
		HealthPath:   healthPath,
		AppHeader:    headerAppSlug,
		Output:       &output,
	}
)

var rootCmd = &cobra.Command{
	Use:   cliName,
	Short: "Operate Quillborne as yourself after " + cliName + " login, or with a client credential pair",
	Long:  "Operate the Quillborne api as yourself after " + cliName + " login, or as a machine client whose client credential pair goes to the service as Basic auth, or with a token in QUBO_TOKEN.",
}

func usageTemplate() string {
	return style.Bold("Usage:") + `{{if .Runnable}}
  {{.UseLine}}{{end}}{{if .HasAvailableSubCommands}}
  {{.CommandPath}} [command]{{end}}{{if gt (len .Aliases) 0}}

` + style.Bold("Aliases:") + `
  {{.NameAndAliases}}{{end}}{{if .HasExample}}

` + style.Bold("Examples:") + `
{{.Example}}{{end}}{{if .HasAvailableSubCommands}}{{$root := .}}{{range $group := .Groups}}

` + style.Bold("{{.Title}}") + `{{range $c := $root.Commands}}{{if (and (eq $c.GroupID $group.ID) (or $c.IsAvailableCommand (eq $c.Name "help")))}}
  ` + style.Accent("{{rpad $c.Name $c.NamePadding }}") + ` {{$c.Short}}{{end}}{{end}}{{end}}{{if not .AllChildCommandsHaveGroup}}

` + style.Bold("Commands:") + `{{range $c := .Commands}}{{if (and (eq $c.GroupID "") (or $c.IsAvailableCommand (eq $c.Name "help")))}}
  ` + style.Accent("{{rpad $c.Name $c.NamePadding }}") + ` {{$c.Short}}{{end}}{{end}}{{end}}{{end}}{{if .HasAvailableLocalFlags}}

` + style.Bold("Flags:") + `
{{.LocalFlags.FlagUsages | trimTrailingWhitespaces}}{{end}}{{if .HasAvailableInheritedFlags}}

` + style.Bold("Global flags:") + `
{{.InheritedFlags.FlagUsages | trimTrailingWhitespaces}}{{end}}{{if .HasAvailableSubCommands}}

` + style.Dim(`Run "{{.CommandPath}} [command] -h" for one command, "`+cliName+` help" for the manual.`) + `{{end}}
`
}

func init() {
	flags := rootCmd.PersistentFlags()
	flags.String("endpoint", "", "quillborne base url, defaults to "+envEndpoint)
	flags.String("app", "", "samna auth app slug of the client, defaults to "+envAppSlug)
	flags.String("client-id", "", "samna_client client_id, defaults to "+envClientID)
	cli.Root(rootCmd, settings, &output)

	rootCmd.Version = cli.GetVersion()
	rootCmd.SetVersionTemplate("{{.Name}} {{.Version}}\n")

	rootCmd.AddGroup(
		&cobra.Group{ID: groupResource, Title: "Resources:"},
		&cobra.Group{ID: groupTool, Title: "Tooling:"},
	)
	helpCmd := cli.HelpCommand(bannerArt, SkillDocument)
	helpCmd.GroupID = groupTool
	rootCmd.SetHelpCommand(helpCmd)
	rootCmd.SetUsageTemplate(usageTemplate())

	if err := client.Mount(rootCmd); err != nil {
		panic(err)
	}
	rootCmd.AddCommand(configCmd, skillCmd, pluginCmd, mcpCmd, cli.CompletionCommand(rootCmd, SkillDocument), cli.VersionCommand(client.GetServerVersion))

	resources := Table().Mount(rootCmd)
	rootCmd.AddCommand(stateCmd)
	registerProvider()

	grouped := map[*cobra.Command]bool{stateCmd: true}
	for _, cmd := range resources {
		grouped[cmd] = true
	}
	for _, cmd := range rootCmd.Commands() {
		cmd.GroupID = groupTool
		if grouped[cmd] || cmd.Hidden {
			cmd.GroupID = groupResource
		}
		if cmd.Name() == "status" {
			cli.PutOutput[cli.Status](cmd)
		}
	}

	rootCmd.SetHelpFunc(cli.HelpFunc(bannerArt, rootCmd.HelpFunc()))
}

func Table() cli.Table {
	return cli.Table{Name: cliName, Send: client.Send, Output: &output, Resources: Resources()}
}

func Execute() int {
	return cli.Execute(rootCmd)
}

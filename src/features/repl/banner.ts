// ASCII logo + REPL banner/help text — the logo is pylon's own CLI banner
// (pylon/cli/banner.py's _LOGO_LINES), reused verbatim rather than Gel's
// dollar-sign balloon, since Pylon already has its own mark.
export const LOGO_LINES = [
  "  ██████╗  ██╗   ██╗██╗      ██████╗ ███╗  ██╗",
  "  ██╔══██╗ ╚██╗ ██╔╝██║     ██╔═══██╗████╗ ██║",
  "  ██████╔╝  ╚████╔╝ ██║     ██║   ██║██╔██╗██║",
  " ██╔═══╝    ╚██╔╝  ██║     ██║   ██║██║╚████║",
  " ██║         ██║   ███████╗╚██████╔╝██║ ╚███║",
  " ╚═╝         ╚═╝   ╚══════╝ ╚═════╝ ╚═╝  ╚══╝",
].join("\n");

export const isMac = () => /Mac|iPod|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent);

export const modKey = () => (isMac() ? "Cmd" : "Ctrl");

export const HELP_TEXT = `Type PyQL statements and press ${modKey()}+Enter to execute them.

  \\help    show this help
  \\clear   clear the history`;

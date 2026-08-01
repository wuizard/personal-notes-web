// Package logging builds the process-wide structured logger. Feature code
// never constructs its own logger — it calls slog's package-level functions
// (slog.InfoContext, slog.WarnContext, ...) against whatever Setup installed
// as the default, keeping call sites free of a threaded-through dependency.
package logging

import (
	"io"
	"log/slog"
	"os"
)

// Setup installs a JSON slog logger as the process default. It always writes
// to stdout — systemd's journal captures that for every deployment without
// any extra config, so `journalctl -u notes-maker-api` keeps working exactly
// as before. When filePath is non-empty (LOG_FILE_PATH, unset in local dev)
// it also appends the same lines to that file, e.g.
// /var/log/notes-maker-api/app.log, so production logs survive independently
// of journald's own retention/vacuum settings and can be tailed or shipped
// with ordinary file tools.
//
// A file that fails to open is a startup warning, not a fatal error —
// losing the file copy shouldn't take the whole process down when stdout
// still works.
func Setup(filePath string) {
	out := io.Writer(os.Stdout)
	if filePath != "" {
		f, err := os.OpenFile(filePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0640)
		if err != nil {
			slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
			slog.Warn("logging: could not open log file, continuing with stdout only", "path", filePath, "error", err)
			return
		}
		out = io.MultiWriter(os.Stdout, f)
	}
	slog.SetDefault(slog.New(slog.NewJSONHandler(out, nil)))
}

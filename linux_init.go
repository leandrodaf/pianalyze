//go:build linux

package main

import "os"

// init sets WebKit2GTK environment variables before any C/WebKit code runs.
//
// Go 1.23+ fatally aborts when non-Go code registers a signal handler without
// the SA_ONSTACK flag ("fatal error: non-Go code set up signal handler without
// SA_ONSTACK flag"). WebKit2GTK does this in several subsystems:
//
//   - The CSS/GPU compositor thread (WEBKIT_DISABLE_COMPOSITING_MODE)
//   - The JSC (JavaScriptCore) JIT null-ptr / stack-overflow checks
//   - The WebKit sandbox (WEBKIT_FORCE_SANDBOX)
//
// Setting these here (in an init function, before main) ensures they are
// visible to WebKit when it initialises inside wails.Run.
func init() {
	os.Setenv("WEBKIT_DISABLE_COMPOSITING_MODE", "1")
	os.Setenv("WEBKIT_FORCE_SANDBOX", "0")
}

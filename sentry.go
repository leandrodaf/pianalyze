package main

import (
	"log"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/leandrodaf/pianalyze/internal/constants"
)

// SentryDSN is injected at compile time via -ldflags "-X main.SentryDSN=<dsn>".
// When empty (dev builds, CI) Sentry is silently disabled — no network calls are made.
var SentryDSN string

func initSentry() {
	if SentryDSN == "" {
		return
	}

	err := sentry.Init(sentry.ClientOptions{
		Dsn:              SentryDSN,
		Release:          Version,
		Environment:      BuildMode,
		TracesSampleRate: 0,
	})
	if err != nil {
		log.Printf("%s: %v", constants.ErrSentryInitialization, err)
	}
}

func flushSentry() {
	if SentryDSN == "" {
		return
	}
	sentry.Flush(2 * time.Second)
}

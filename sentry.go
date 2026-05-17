package main

import (
	"context"
	"log"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/leandrodaf/pianalyze/internal/constants"
)

// SentryDSN is injected at compile time via -ldflags "-X main.SentryDSN=<dsn>".
// When empty (dev builds, CI) Sentry is silently disabled — no network calls are made.
var SentryDSN string

// meter is the app-wide metrics emitter; a no-op instance when DSN is empty.
var meter sentry.Meter

func initSentry() {
	if SentryDSN == "" {
		return
	}

	err := sentry.Init(sentry.ClientOptions{
		Dsn:              SentryDSN,
		Release:          Version,
		Environment:      BuildMode,
		DisableMetrics:   false,
		TracesSampleRate: 0,
	})
	if err != nil {
		log.Printf("%s: %v", constants.ErrSentryInitialization, err)
		return
	}

	meter = sentry.NewMeter(context.Background())
	meter.Count("app.launched", 1)
}

func flushSentry() {
	if SentryDSN == "" {
		return
	}
	sentry.Flush(2 * time.Second)
}

// sentryCount increments a named counter by n.
func sentryCount(name string, n int64) {
	if meter != nil {
		meter.Count(name, n)
	}
}

// sentryDist records a distribution sample (durations, sizes, counts per event).
func sentryDist(name string, value float64) {
	if meter != nil {
		meter.Distribution(name, value)
	}
}

// sentryCaptureErr sends a non-nil error to Sentry.
func sentryCaptureErr(err error) {
	if err != nil && SentryDSN != "" {
		sentry.CaptureException(err)
	}
}

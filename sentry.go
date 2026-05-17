package main

import (
	"context"
	"log"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/getsentry/sentry-go/attribute"
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

// sentryCount increments a named counter by n. Optional attributes add
// dimensions (e.g. device name, piece name) visible in the Sentry metrics UI.
func sentryCount(name string, n int64, opts ...sentry.MeterOption) {
	if meter != nil {
		meter.Count(name, n, opts...)
	}
}

// sentryDist records a distribution sample (durations, sizes, counts per event).
func sentryDist(name string, value float64, opts ...sentry.MeterOption) {
	if meter != nil {
		meter.Distribution(name, value, opts...)
	}
}

// sentryAttr returns a MeterOption that attaches a string attribute to a metric.
// Use this to add filterable dimensions (e.g. sentryAttr("name", pieceName)).
func sentryAttr(key, value string) sentry.MeterOption {
	return sentry.WithAttributes(attribute.String(key, value))
}

// sentrySetTag sets a persistent tag on the Sentry scope so it appears on all
// subsequent error and event reports for this session.
func sentrySetTag(key, value string) {
	if SentryDSN == "" {
		return
	}
	sentry.ConfigureScope(func(scope *sentry.Scope) {
		scope.SetTag(key, value)
	})
}

// sentryCaptureErr sends a non-nil error to Sentry.
func sentryCaptureErr(err error) {
	if err != nil && SentryDSN != "" {
		sentry.CaptureException(err)
	}
}

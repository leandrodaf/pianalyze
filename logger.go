package main

import (
	"log"

	"github.com/leandrodaf/pianalyze/internal/constants"
	"go.uber.org/zap"
)

// BuildMode is set at compile time via -ldflags to select the logging format.
// "production" emits structured JSON; any other value uses human-readable development format.
var BuildMode string

// Version is set at compile time via -ldflags "-X main.Version=<semver>".
// Empty in dev builds.
var Version string

func initLogger() *zap.Logger {
	var (
		logger *zap.Logger
		err    error
	)

	if BuildMode == constants.BuildModeProduction {
		logger, err = zap.NewProduction()
	} else {
		logger, err = zap.NewDevelopment()
	}

	if err != nil {
		log.Fatalf("%s: %v", constants.ErrLoggerInitialization, err)
	}

	return logger
}

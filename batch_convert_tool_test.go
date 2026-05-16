//go:build tools

// batch_convert_tool.go — Run with: go test -tags "tools webkit2_41" -run TestBatchConvert -v .
//
// Environment variables:
//   CONVERT_INPUT  — directory with .xml/.musicxml/.mxl files (default: /tmp/musicxml_input)
//   CONVERT_OUTPUT — directory to write .pia files            (default: /tmp/musicxml_output)
//
// Usage example:
//   CONVERT_INPUT=~/musicxml CONVERT_OUTPUT=./data/library \
//     go test -tags "tools webkit2_41" -run TestBatchConvert -v . -timeout 120s

package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"go.uber.org/zap"
)

func TestBatchConvert(t *testing.T) {
	inputDir := os.Getenv("CONVERT_INPUT")
	if inputDir == "" {
		inputDir = "/tmp/musicxml_input"
	}
	outputDir := os.Getenv("CONVERT_OUTPUT")
	if outputDir == "" {
		outputDir = "/tmp/musicxml_output"
	}

	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		t.Fatalf("cannot create output dir %q: %v", outputDir, err)
	}

	logger, _ := zap.NewDevelopment()

	var ok, fail, skip int
	err := filepath.WalkDir(inputDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		ext := strings.ToLower(filepath.Ext(path))
		if ext != ".xml" && ext != ".musicxml" && ext != ".mxl" {
			return nil
		}

		raw, readErr := os.ReadFile(path)
		if readErr != nil {
			t.Logf("SKIP %s: read error: %v", path, readErr)
			skip++
			return nil
		}

		xmlData := raw
		if ext == ".mxl" {
			var mxlErr error
			xmlData, mxlErr = extractMXL(raw)
			if mxlErr != nil {
				t.Logf("SKIP %s: MXL extract error: %v", path, mxlErr)
				skip++
				return nil
			}
		}

		rec, convErr := convertMusicXML(xmlData, path, logger)
		if convErr != nil {
			t.Logf("FAIL %s: conversion error: %v", path, convErr)
			fail++
			return nil
		}
		if len(rec.Events) == 0 {
			t.Logf("SKIP %s: no events", path)
			skip++
			return nil
		}

		outName := buildOutputName(rec, path)
		outPath := filepath.Join(outputDir, outName)

		out, jsonErr := json.Marshal(rec)
		if jsonErr != nil {
			t.Logf("FAIL %s: marshal error: %v", path, jsonErr)
			fail++
			return nil
		}
		if writeErr := os.WriteFile(outPath, out, 0o644); writeErr != nil {
			t.Logf("FAIL %s: write error: %v", path, writeErr)
			fail++
			return nil
		}
		title := ""
		composer := ""
		if rec.Meta != nil {
			title = rec.Meta.Title
			composer = rec.Meta.Composer
		}
		t.Logf("OK   %-50s  →  %s  [%s / %s  events=%d]",
			filepath.Base(path), outName, composer, title, len(rec.Events))
		ok++
		return nil
	})

	if err != nil {
		t.Fatalf("walk error: %v", err)
	}
	fmt.Printf("\n✓ converted=%d  ✗ failed=%d  ⊘ skipped=%d\n", ok, fail, skip)
}

// buildOutputName creates a safe, human-readable filename for the .pia output.
func buildOutputName(rec *Recording, srcPath string) string {
	composer := ""
	title := ""
	if rec.Meta != nil {
		composer = rec.Meta.Composer
		title = rec.Meta.Title
	}

	safe := func(s string) string {
		var sb strings.Builder
		for _, r := range strings.ToLower(s) {
			switch {
			case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
				sb.WriteRune(r)
			case r == ' ', r == '_', r == '-', r == '.', r == ',':
				sb.WriteRune('_')
			}
		}
		return strings.Trim(sb.String(), "_")
	}

	c := safe(composer)
	ti := safe(title)
	if c == "" && ti == "" {
		ti = safe(strings.TrimSuffix(filepath.Base(srcPath), filepath.Ext(srcPath)))
	}
	if c == "" {
		c = "unknown"
	}
	if ti == "" {
		ti = "untitled"
	}
	if len(c) > 30 {
		c = c[:30]
	}
	if len(ti) > 50 {
		ti = ti[:50]
	}
	return c + "__" + ti + ".pia"
}

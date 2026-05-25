.PHONY: dev build test lint generate tidy

# Workaround: WEBKIT_DISABLE_COMPOSITING_MODE=1 prevents the WebKit2GTK C
# compositor from registering a SIGSEGV handler without SA_ONSTACK, which
# would otherwise cause Go's runtime to abort with:
#   "fatal error: non-Go code set up signal handler without SA_ONSTACK flag"
WEBKIT_FLAGS := WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_FORCE_SANDBOX=0

dev:
	$(WEBKIT_FLAGS) wails dev -tags webkit2_41

build:
	wails build -tags webkit2_41

test:
	go test -race -tags webkit2_41 ./...

lint:
	golangci-lint run --build-tags webkit2_41 ./...

generate:
	go generate ./...

tidy:
	go mod tidy

.DEFAULT_GOAL := all
.PHONY: all help check install run local dev prod tts clean

TTS_PORT := 8765
LOCAL_URL := http://localhost:5174
DEV_URL := https://app.dev.zipq.io/
PROD_URL := https://app.zipq.io/
TARGET_URL ?= $(LOCAL_URL)
export TARGET_URL

help:
	@echo "Voice Test - usage:"
	@echo "  make          Install everything and start on local (same as 'make all')"
	@echo "  make local    Start against $(LOCAL_URL)"
	@echo "  make dev      Start against $(DEV_URL)"
	@echo "  make prod     Start against $(PROD_URL)"
	@echo "  make install  Install dependencies only"
	@echo "  make run      Start the voice tool (assumes installed)"
	@echo "  make clean    Remove installed files and stop any leftover server"

all: install run

check:
	@[ "$$(uname)" = "Darwin" ] || { echo "This tool needs a Mac (it uses the built-in 'say' voice)."; exit 1; }
	@command -v node >/dev/null || { echo "Node.js is missing. Install it from https://nodejs.org (download the LTS version), then run 'make' again."; exit 1; }
	@command -v python3 >/dev/null || { echo "Python 3 is missing. Run 'xcode-select --install', then run 'make' again."; exit 1; }

install: check
	@echo "==> Installing packages..."
	@npm install
	@echo "==> Installing the browser (first time can take a few minutes)..."
	@npx playwright install chromium
	@echo "==> Install complete."

# Starts the speech server in the background, runs the tool, and always stops the server on exit.
run: check
	@[ -d node_modules ] || { echo "Not installed yet - run 'make' first."; exit 1; }
	@lsof -ti tcp:$(TTS_PORT) | xargs kill 2>/dev/null || true
	@python3 tts-server.py & TTS_PID=$$!; \
	trap 'kill $$TTS_PID 2>/dev/null' EXIT INT TERM; \
	sleep 1; \
	echo "==> Speech server running. Starting the browser..."; \
	npm start

local: TARGET_URL := $(LOCAL_URL)
local: install run

dev: TARGET_URL := $(DEV_URL)
dev: install run

prod: TARGET_URL := $(PROD_URL)
prod: install run

tts: check
	python3 tts-server.py

clean:
	@lsof -ti tcp:$(TTS_PORT) | xargs kill 2>/dev/null || true
	rm -rf node_modules

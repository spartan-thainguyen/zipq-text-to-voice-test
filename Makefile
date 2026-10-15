.DEFAULT_GOAL := all
.PHONY: all help check install run tts clean

TTS_PORT := 8765

help:
	@echo "Voice Test - usage:"
	@echo "  make          Install everything and start (same as 'make all')"
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

tts: check
	python3 tts-server.py

clean:
	@lsof -ti tcp:$(TTS_PORT) | xargs kill 2>/dev/null || true
	rm -rf node_modules

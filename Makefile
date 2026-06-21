.PHONY: help up down test lint clean install

help:
	@echo "Available commands:"
	@echo "  make install  - Install Python dependencies (including dev)"
	@echo "  make up       - Start local infrastructure (Docker Compose)"
	@echo "  make down     - Stop local infrastructure"
	@echo "  make test     - Run pytest suite"
	@echo "  make lint     - Run formatting and linting checks"
	@echo "  make clean    - Remove build and test artifacts"

install:
	pip install -e .[dev] -e ./shared

up:
	docker compose up -d

down:
	docker compose down

test:
	pytest tests/

lint:
	black --check .
	isort --check-only .

clean:
	rm -rf .pytest_cache .hypothesis build dist *.egg-info
	find . -type d -name "__pycache__" -exec rm -r {} +

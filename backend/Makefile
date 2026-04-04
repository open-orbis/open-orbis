.PHONY: install lint format test

install:
	uv sync --all-extras

lint:
	uv run ruff check .

format:
	uv run ruff format .

test:
	uv run pytest

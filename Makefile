.PHONY: help setup frontend backend build

help:
	@echo "make setup     安装前后端依赖（首次运行）"
	@echo "make backend   启动 FastAPI：127.0.0.1:8000"
	@echo "make frontend  启动 Vue：127.0.0.1:5173"
	@echo "make build     检查 TypeScript 并构建前端"

setup:
	npm --prefix frontend ci
	cd backend && uv sync --locked

frontend:
	npm --prefix frontend run dev

backend:
	cd backend && uv run --locked uvicorn app.main:app --reload --reload-dir app --host 127.0.0.1 --port 8000

build:
	npm --prefix frontend run build

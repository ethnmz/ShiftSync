"""FastAPI app. Routers from app/routes/ are mounted under /api.

Teammates' routers plug in without editing this file: any module listed in
OPTIONAL_ROUTERS that exists and exposes `router` is included.
"""
from __future__ import annotations

import importlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlmodel import Session

from app import db
from app.handoff.service import ServiceError
from app.routes import handoff as handoff_routes

log = logging.getLogger(__name__)

OPTIONAL_ROUTERS = ("app.routes.ingest", "app.routes.verification", "app.routes.supervisor",
                    "app.routes.eval", "app.routes.demo", "app.routes.inbound")


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    with Session(db.get_engine()) as s:
        db.load_static(s)
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="ShiftSync", lifespan=lifespan)

    @app.exception_handler(ServiceError)
    async def _service_error(_: Request, exc: ServiceError):
        return JSONResponse(status_code=exc.status,
                            content={"detail": {"code": exc.code, "message": exc.message, **exc.payload}})

    app.include_router(handoff_routes.router, prefix="/api")
    for name in OPTIONAL_ROUTERS:
        try:
            mod = importlib.import_module(name)
        except ModuleNotFoundError as e:
            if e.name != name:
                raise  # the module exists but one of its imports is broken
            continue
        app.include_router(mod.router, prefix="/api")
        log.info("mounted %s", name)

    @app.get("/api/health")
    def health():
        return {"ok": True}

    return app


app = create_app()

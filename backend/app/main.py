from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import (
    activity,
    admin,
    canon,
    config,
    discover,
    edges,
    graph,
    ingest,
    nodes,
    projects,
    rag,
    search,
    sources,
    tags,
)
from app.core.config import get_settings
from app.core.lifespan import lifespan

settings = get_settings()

app = FastAPI(
    title="Constellation",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_v1_prefix = "/api/v1"
app.include_router(nodes.router, prefix=_v1_prefix)
app.include_router(edges.router, prefix=_v1_prefix)
app.include_router(sources.router, prefix=_v1_prefix)
app.include_router(tags.router, prefix=_v1_prefix)
app.include_router(config.router, prefix=_v1_prefix)
app.include_router(search.router, prefix=_v1_prefix)
app.include_router(rag.router, prefix=_v1_prefix)
app.include_router(graph.router, prefix=_v1_prefix)
app.include_router(ingest.router, prefix=_v1_prefix)
app.include_router(discover.router, prefix=_v1_prefix)
app.include_router(admin.router, prefix=_v1_prefix)
app.include_router(activity.router, prefix=_v1_prefix)
app.include_router(projects.router, prefix=_v1_prefix)
app.include_router(canon.router, prefix=_v1_prefix)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}

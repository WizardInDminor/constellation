from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import (
    activity,
    admin,
    builder,
    canon,
    config,
    context,
    decisions,
    discover,
    edges,
    graph,
    ingest,
    nodes,
    projects,
    proposals,
    rag,
    search,
    sources,
    tags,
)
from app.core.config import get_settings
from app.core.errors import WorkflowError, workflow_error_handler
from app.core.lifespan import lifespan
from app.mcp.server import build_mcp_asgi_app

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
app.include_router(builder.router, prefix=_v1_prefix)
app.include_router(proposals.router, prefix=_v1_prefix)
app.include_router(decisions.router, prefix=_v1_prefix)
app.include_router(context.router, prefix=_v1_prefix)

# Structured error envelope for workflow-core routes (Phase C1, ADR-084).
app.add_exception_handler(WorkflowError, workflow_error_handler)

# MCP tool surface (Phase C4, ADR-089): bearer-token-gated streamable HTTP,
# in-process so tools share the single DB connection and service layer.
# Disabled (403) unless MCP_TOKENS is configured in .env.
app.mount("/mcp", build_mcp_asgi_app())


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}

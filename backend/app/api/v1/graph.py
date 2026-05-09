from fastapi import APIRouter

from app.core.deps import DB
from app.models.graph import GraphData
from app.repositories import graph_repo

router = APIRouter(prefix="/graph", tags=["graph"])


@router.get("/data")
async def get_graph_data(
    db: DB,
    include_fleeting: bool = False,
) -> GraphData:
    return await graph_repo.get_graph_data(db, include_fleeting=include_fleeting)

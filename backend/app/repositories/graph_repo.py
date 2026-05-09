import aiosqlite

from app.models.graph import GraphData, GraphEdgeRef, GraphNodeRef


async def get_graph_data(
    db: aiosqlite.Connection,
    *,
    include_fleeting: bool = False,
) -> GraphData:
    type_filter = "" if include_fleeting else "AND n.type != 'fleeting'"
    cursor = await db.execute(
        f"""
        SELECT n.id, n.title, n.type,
               COALESCE(GROUP_CONCAT(t.name, ','), '') AS tags
        FROM nodes n
        LEFT JOIN node_tags nt ON nt.node_id = n.id
        LEFT JOIN tags t ON t.id = nt.tag_id
        WHERE n.deleted_at IS NULL
          {type_filter}
        GROUP BY n.id
        ORDER BY n.created_at DESC
        """  # noqa: S608
    )
    rows = await cursor.fetchall()
    nodes = [
        GraphNodeRef(
            id=row["id"],
            title=row["title"],
            type=row["type"],
            tags=[t for t in row["tags"].split(",") if t],
        )
        for row in rows
    ]

    edge_type_filter = (
        ""
        if include_fleeting
        else "AND fn.type != 'fleeting' AND tn.type != 'fleeting'"
    )
    cursor = await db.execute(
        f"""
        SELECT e.id, e.from_id, e.to_id, e.type, e.note
        FROM edges e
        JOIN nodes fn ON fn.id = e.from_id AND fn.deleted_at IS NULL
        JOIN nodes tn ON tn.id = e.to_id   AND tn.deleted_at IS NULL
        {edge_type_filter}
        """  # noqa: S608
    )
    rows = await cursor.fetchall()
    edges = [
        GraphEdgeRef(
            id=row["id"],
            from_id=row["from_id"],
            to_id=row["to_id"],
            type=row["type"],
            note=row["note"],
        )
        for row in rows
    ]

    return GraphData(nodes=nodes, edges=edges)

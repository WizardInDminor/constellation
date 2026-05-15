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

    # Source nodes — always included regardless of include_fleeting
    cursor = await db.execute(
        "SELECT id, title, type, author, url FROM sources ORDER BY created_at DESC"
    )
    rows = await cursor.fetchall()
    nodes += [
        GraphNodeRef(
            id=row["id"],
            title=row["title"],
            type="source",
            tags=[],
            source_url=row["url"],
            source_author=row["author"],
            source_entry_type=row["type"],
        )
        for row in rows
    ]

    edge_type_filter = (
        "" if include_fleeting else "AND fn.type != 'fleeting' AND tn.type != 'fleeting'"
    )
    cursor = await db.execute(
        f"""
        SELECT e.id, e.from_id, e.to_id, e.type, e.note, e.classifier_rationale,
               e.resolved_at, e.resolved_by_node_id
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
            classifier_rationale=row["classifier_rationale"],
            resolved_at=row["resolved_at"],
            resolved_by_node_id=row["resolved_by_node_id"],
        )
        for row in rows
    ]

    # Synthetic CITES edges — literature notes pointing to their source
    # Scoped to non-deleted nodes; fleeting filter does not apply (lit notes aren't fleeting)
    cursor = await db.execute(
        """
        SELECT id, source_id FROM nodes
        WHERE source_id IS NOT NULL AND deleted_at IS NULL
        """
    )
    rows = await cursor.fetchall()
    edges += [
        GraphEdgeRef(
            id=f"cites-{row['id']}",
            from_id=row["id"],
            to_id=row["source_id"],
            type="CITES",
        )
        for row in rows
    ]

    return GraphData(nodes=nodes, edges=edges)

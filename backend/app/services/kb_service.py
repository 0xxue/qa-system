"""
Knowledge Base Service — Document upload, chunking, indexing, search

Pipeline: Upload → Parse (PDF/Word/Excel) → Chunk → Embed → Store in pgvector
Search:   Query → Embed → pgvector cosine similarity → Return relevant chunks
"""

import os
import json
import structlog
import numpy as np
from typing import Optional

from app.core.config import get_settings
from app.services.doc_parser import DocumentParser
from app.services.embedding import get_embedding_service

logger = structlog.get_logger()


class KnowledgeBaseService:
    """Manage knowledge bases, documents, and vector search — backed by PostgreSQL + pgvector."""

    def __init__(self):
        self.parser = DocumentParser(chunk_size=500, chunk_overlap=50)
        self.embedding_service = get_embedding_service()
        self.settings = get_settings()

    def _get_sf(self):
        from app.services.database import _session_factory
        return _session_factory

    # ========== Documents ==========

    async def upload_document(self, collection_id: int, file_path: str, filename: str) -> dict:
        """
        Upload and process a document:
        1. Parse file (PDF/Word/Excel/Text)
        2. Split into chunks
        3. Generate embeddings
        4. Store document + chunks in PostgreSQL
        """
        from sqlalchemy import text
        sf = self._get_sf()
        if not sf:
            raise RuntimeError("Database not available")

        file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
        file_type = os.path.splitext(filename)[1].lower().lstrip(".")

        # Insert document record (status: processing)
        async with sf() as session:
            result = await session.execute(
                text(
                    "INSERT INTO kb_documents (collection_id, filename, file_type, file_size, file_path, status) "
                    "VALUES (:cid, :fn, :ft, :fs, :fp, 'processing') RETURNING id"
                ),
                {"cid": collection_id, "fn": filename, "ft": file_type, "fs": file_size, "fp": file_path},
            )
            doc_id = result.scalar()
            await session.commit()

        try:
            # Step 1: Parse document
            logger.info("Parsing document", filename=filename, type=file_type)
            parsed_chunks = self.parser.parse(file_path)

            if not parsed_chunks:
                await self._update_doc_status(doc_id, "failed", "No content extracted")
                return {"id": doc_id, "status": "failed", "error_msg": "No content extracted"}

            # Step 2: Generate embeddings
            logger.info("Generating embeddings", chunks=len(parsed_chunks))
            texts = [chunk.content for chunk in parsed_chunks]
            embeddings = await self.embedding_service.embed(texts)

            # Step 3: Store chunks with vectors in pgvector
            async with sf() as session:
                for i, (chunk, embedding) in enumerate(zip(parsed_chunks, embeddings)):
                    vec_list = embedding.tolist() if hasattr(embedding, 'tolist') else list(embedding)
                    vec_str = "[" + ",".join(str(v) for v in vec_list) + "]"
                    metadata = {**chunk.metadata, "filename": filename}

                    await session.execute(
                        text(
                            "INSERT INTO kb_chunks (document_id, collection_id, content, metadata_json, embedding) "
                            "VALUES (:did, :cid, :content, :meta, cast(:emb AS vector))"
                        ),
                        {
                            "did": doc_id,
                            "cid": collection_id,
                            "content": chunk.content,
                            "meta": json.dumps(metadata, ensure_ascii=False),
                            "emb": vec_str,
                        },
                    )

                # Update document status
                await session.execute(
                    text("UPDATE kb_documents SET status = 'ready', chunk_count = :cnt WHERE id = :id"),
                    {"cnt": len(parsed_chunks), "id": doc_id},
                )

                # Update collection doc_count
                await session.execute(
                    text("UPDATE kb_collections SET doc_count = doc_count + 1 WHERE id = :cid"),
                    {"cid": collection_id},
                )

                await session.commit()

            logger.info("Document processed", doc_id=doc_id, chunks=len(parsed_chunks), filename=filename)
            return {"id": doc_id, "status": "ready", "chunk_count": len(parsed_chunks), "filename": filename}

        except Exception as e:
            logger.error("Document processing failed", error=str(e), filename=filename)
            await self._update_doc_status(doc_id, "failed", str(e))
            return {"id": doc_id, "status": "failed", "error_msg": str(e)}

    async def _update_doc_status(self, doc_id: int, status: str, error_msg: str = ""):
        from sqlalchemy import text
        sf = self._get_sf()
        if not sf:
            return
        async with sf() as session:
            await session.execute(
                text("UPDATE kb_documents SET status = :s, error_msg = :e WHERE id = :id"),
                {"s": status, "e": error_msg, "id": doc_id},
            )
            await session.commit()

    async def delete_document(self, document_id: int) -> bool:
        from sqlalchemy import text
        sf = self._get_sf()
        if not sf:
            return False
        async with sf() as session:
            # Get collection_id first
            result = await session.execute(
                text("SELECT collection_id FROM kb_documents WHERE id = :id"), {"id": document_id}
            )
            cid = result.scalar()
            if not cid:
                return False

            # Delete chunks and document
            await session.execute(text("DELETE FROM kb_chunks WHERE document_id = :id"), {"id": document_id})
            await session.execute(text("DELETE FROM kb_documents WHERE id = :id"), {"id": document_id})
            await session.execute(
                text("UPDATE kb_collections SET doc_count = GREATEST(doc_count - 1, 0) WHERE id = :cid"),
                {"cid": cid},
            )
            await session.commit()
        return True

    async def list_documents(self, collection_id: int) -> list[dict]:
        from sqlalchemy import text
        sf = self._get_sf()
        if not sf:
            return []
        async with sf() as session:
            result = await session.execute(
                text("SELECT id, filename, file_type, file_size, chunk_count, status, error_msg, created_at "
                     "FROM kb_documents WHERE collection_id = :cid ORDER BY created_at DESC"),
                {"cid": collection_id},
            )
            return [dict(row) for row in result.mappings().all()]

    # ========== Search ==========

    async def search(self, query: str, collection_id: int = None, category: str = None, tags: list[str] = None, top_k: int = 5) -> list[dict]:
        """
        Semantic search using pgvector cosine similarity.
        Supports filtering by collection_id, category, or tags.
        """
        from sqlalchemy import text
        sf = self._get_sf()
        if not sf:
            return []

        # Embed query
        query_embedding = await self.embedding_service.embed([query])
        vec = query_embedding[0]
        vec_str = "[" + ",".join(str(float(v)) for v in vec) + "]"

        # Build WHERE clause with optional filters
        where = "WHERE 1=1"
        params: dict = {"vec": vec_str, "k": top_k}

        if collection_id:
            where += " AND c.collection_id = :cid"
            params["cid"] = collection_id

        if category:
            where += " AND col.category = :cat"
            params["cat"] = category

        if tags:
            # Match any tag in the collection's tags array
            where += " AND col.tags ?| :tags"
            params["tags"] = tags

        # Join with collections table for tag/category filtering
        join = "JOIN kb_collections col ON c.collection_id = col.id" if (category or tags) else ""

        async with sf() as session:
            result = await session.execute(
                text(f"""
                    SELECT c.id, c.document_id, c.collection_id, c.content, c.metadata_json,
                           1 - (c.embedding <=> cast(:vec AS vector)) AS similarity
                    FROM kb_chunks c
                    {join}
                    {where}
                    ORDER BY c.embedding <=> cast(:vec AS vector)
                    LIMIT :k
                """),
                params,
            )
            rows = result.mappings().all()

        results = []
        for row in rows:
            results.append({
                "chunk_id": row["id"],
                "document_id": row["document_id"],
                "collection_id": row["collection_id"],
                "content": row["content"],
                "metadata": row["metadata_json"] if isinstance(row["metadata_json"], dict) else (json.loads(row["metadata_json"]) if row["metadata_json"] else {}),
                "similarity": round(float(row["similarity"]), 4),
            })

        logger.info("KB search", query=query[:50], results=len(results))
        return results

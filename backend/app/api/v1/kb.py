"""
Knowledge Base API — Upload documents, manage collections, semantic search

POST /kb/collections           → Create knowledge base
GET  /kb/collections           → List knowledge bases
DELETE /kb/collections/{id}    → Delete knowledge base
POST /kb/collections/{id}/documents → Upload document (PDF/Word/Excel)
GET  /kb/collections/{id}/documents → List documents
DELETE /kb/documents/{id}      → Delete document
POST /kb/search                → Semantic search across knowledge base
"""

import os
import shutil
import structlog
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from typing import Optional

from app.services.auth import get_optional_user
from app.services.kb_service import KnowledgeBaseService
from app.core.config import get_settings

router = APIRouter()
logger = structlog.get_logger()


def _get_kb_service() -> KnowledgeBaseService:
    return KnowledgeBaseService()


# ========== Collections ==========

@router.get("/collections")
async def list_collections(user=Depends(get_optional_user)):
    """List all knowledge bases."""
    # List all collections (no owner filter — shared within organization)
    from app.services.database import _session_factory
    from sqlalchemy import text
    if _session_factory:
        async with _session_factory() as session:
            result = await session.execute(text(
                "SELECT id, name, description, doc_count, status, created_at FROM kb_collections ORDER BY created_at DESC"
            ))
            collections = [dict(row) for row in result.mappings().all()]
            return {"collections": collections}
    # Fallback to in-memory
    svc = _get_kb_service()
    collections = await svc.list_collections()
    return {"collections": collections}


@router.post("/collections")
async def create_collection(
    name: str = Form(...),
    description: str = Form(""),
    user=Depends(get_optional_user),
):
    """Create a new knowledge base."""
    from app.services.database import _session_factory
    from sqlalchemy import text
    if _session_factory:
        async with _session_factory() as session:
            result = await session.execute(
                text("INSERT INTO kb_collections (name, description, owner_id) VALUES (:n, :d, :o) RETURNING id, name, description, doc_count, status"),
                {"n": name, "d": description, "o": int(user.id) if str(user.id).isdigit() else 1},
            )
            row = result.mappings().first()
            await session.commit()
            return dict(row) if row else {"name": name}
    svc = _get_kb_service()
    return await svc.create_collection(name, description, owner_id=int(user.id))


@router.delete("/collections/{collection_id}")
async def delete_collection(collection_id: int, user=Depends(get_optional_user)):
    """Delete a knowledge base and all its documents."""
    from app.services.database import _session_factory
    from sqlalchemy import text
    if _session_factory:
        async with _session_factory() as session:
            result = await session.execute(text("DELETE FROM kb_collections WHERE id = :id RETURNING id"), {"id": collection_id})
            deleted = result.scalar()
            await session.commit()
            if not deleted:
                raise HTTPException(status_code=404, detail="Collection not found")
            return {"status": "deleted"}
    svc = _get_kb_service()
    deleted = await svc.delete_collection(collection_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Collection not found")
    return {"status": "deleted"}


# ========== Documents ==========

@router.get("/collections/{collection_id}/documents")
async def list_documents(collection_id: int, user=Depends(get_optional_user)):
    """List documents in a knowledge base."""
    from app.services.database import _session_factory
    from sqlalchemy import text
    if _session_factory:
        async with _session_factory() as session:
            result = await session.execute(
                text("SELECT id, filename, file_type, file_size, chunk_count, status, error_msg, created_at FROM kb_documents WHERE collection_id = :cid ORDER BY created_at DESC"),
                {"cid": collection_id},
            )
            documents = [dict(row) for row in result.mappings().all()]
            return {"documents": documents}
    svc = _get_kb_service()
    documents = await svc.list_documents(collection_id)
    return {"documents": documents}


@router.post("/collections/{collection_id}/documents")
async def upload_document(
    collection_id: int,
    file: UploadFile = File(...),
    user=Depends(get_optional_user),
):
    """
    Upload a document to a knowledge base.
    Supports: PDF, Word (.docx), Excel (.xlsx/.csv), Text (.txt/.md)
    """
    settings = get_settings()

    # Validate file type
    ext = os.path.splitext(file.filename)[1].lower()
    allowed = {".pdf", ".docx", ".doc", ".xlsx", ".xls", ".csv", ".txt", ".md"}
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}. Allowed: {allowed}")

    # Save uploaded file
    upload_dir = os.path.join(settings.upload_dir, str(collection_id))
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    logger.info("File uploaded", filename=file.filename, size=file.size, collection=collection_id)

    # Process document (parse → chunk → embed → store)
    svc = _get_kb_service()
    result = await svc.upload_document(collection_id, file_path, file.filename)

    if result["status"] == "failed":
        raise HTTPException(status_code=500, detail=f"Processing failed: {result.get('error_msg')}")

    return result


@router.delete("/documents/{document_id}")
async def delete_document(document_id: int, user=Depends(get_optional_user)):
    """Delete a document and its chunks."""
    svc = _get_kb_service()
    deleted = await svc.delete_document(document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"status": "deleted"}


# ========== Search ==========

@router.post("/search")
async def search_knowledge_base(
    query: str = Form(...),
    collection_id: Optional[int] = Form(None),
    top_k: int = Form(5),
    user=Depends(get_optional_user),
):
    """
    Semantic search across knowledge base.
    Returns relevant document chunks ranked by similarity.
    """
    svc = _get_kb_service()
    results = await svc.search(query, collection_id=collection_id, top_k=top_k)
    return {"query": query, "results": results, "total": len(results)}

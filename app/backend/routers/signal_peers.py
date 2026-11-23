import json
from datetime import date, datetime
from typing import Optional

from core.database import get_db
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from services.signal_peers import SignalPeersService
from sqlalchemy.ext.asyncio import AsyncSession


router = APIRouter(prefix="/api/v1/entities/signal_peers", tags=["signal_peers"])


class SignalPeersData(BaseModel):
    room_id: int
    peer_id: str
    display_name: str
    role: str
    token_hash: str
    last_seen_ms: int


class SignalPeersUpdateData(BaseModel):
    room_id: Optional[int] = None
    peer_id: Optional[str] = None
    display_name: Optional[str] = None
    role: Optional[str] = None
    token_hash: Optional[str] = None
    last_seen_ms: Optional[int] = None


class SignalPeersResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    room_id: int
    peer_id: str
    display_name: str
    role: str
    token_hash: str
    last_seen_ms: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class SignalPeersListResponse(BaseModel):
    items: list[SignalPeersResponse]
    total: int
    skip: int
    limit: int


def parse_query(value: str | None) -> dict | None:
    if not value:
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid query JSON") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="Query must be a JSON object")
    return parsed


@router.get("", response_model=SignalPeersListResponse)
async def query_items(
    query: str | None = Query(None),
    sort: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=2000),
    fields: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await SignalPeersService(db).get_list(
            skip=skip, limit=limit, query=parse_query(query), sort=sort, user_id=None
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/all", response_model=SignalPeersListResponse)
async def query_all_items(
    query: str | None = Query(None),
    sort: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=2000),
    fields: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await SignalPeersService(db).get_list(
            skip=skip, limit=limit, query=parse_query(query), sort=sort
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{item_id}", response_model=SignalPeersResponse)
async def get_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
):
    item = await SignalPeersService(db).get_by_id(item_id, None)
    if item is None:
        raise HTTPException(status_code=404, detail="SignalPeers not found")
    return item


@router.post("", response_model=SignalPeersResponse, status_code=201)
async def create_item(
    data: SignalPeersData,
    db: AsyncSession = Depends(get_db),
):
    return await SignalPeersService(db).create(data.model_dump(exclude_unset=True), None)


@router.put("/{item_id}", response_model=SignalPeersResponse)
async def update_item(
    item_id: int,
    data: SignalPeersUpdateData,
    db: AsyncSession = Depends(get_db),
):
    item = await SignalPeersService(db).update(
        item_id, data.model_dump(exclude_unset=True), None
    )
    if item is None:
        raise HTTPException(status_code=404, detail="SignalPeers not found")
    return item


@router.delete("/{item_id}")
async def delete_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
):
    deleted = await SignalPeersService(db).delete(item_id, None)
    if not deleted:
        raise HTTPException(status_code=404, detail="SignalPeers not found")
    return {"id": item_id, "deleted": True}

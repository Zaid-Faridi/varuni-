import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from models import ChangeEvent
from schemas import ChangeEventResponse

router = APIRouter(
    prefix="/api/v1/changes",
    tags=["changes"]
)


@router.get("/", response_model=List[ChangeEventResponse])
def list_change_events(
    watershed_id: Optional[uuid.UUID] = None,
    metric: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    List observed change events.
    Terminology strictly adheres to 'observed change' rather than causal 'impact'.
    """
    query = db.query(ChangeEvent)
    if watershed_id:
        query = query.filter(ChangeEvent.watershed_id == watershed_id)
    if metric:
        query = query.filter(ChangeEvent.metric == metric)

    events = query.order_by(ChangeEvent.to_date.desc()).offset(skip).limit(limit).all()
    results = []
    for ev in events:
        ws_name = ev.watershed.name if hasattr(ev, "watershed") and ev.watershed else None
        results.append(ChangeEventResponse(
            id=ev.id,
            watershed_id=ev.watershed_id,
            watershed_name=ws_name,
            from_date=ev.from_date,
            to_date=ev.to_date,
            metric=ev.metric,
            delta=ev.delta,
            from_value=ev.from_value,
            to_value=ev.to_value,
            confidence=ev.confidence,
            severity=ev.severity,
            provenance=ev.provenance,
            created_at=ev.created_at
        ))
    return results

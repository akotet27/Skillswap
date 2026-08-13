"""Phase 4 REST support endpoint. The actual signaling relay is the
WebSocket router in app/api/routes/signaling_ws.py."""
from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.video import IceServersOut
from app.services.video import build_ice_servers

router = APIRouter(prefix="/api/video", tags=["video"])


@router.get("/ice-servers", response_model=IceServersOut)
def get_ice_servers(_user: User = Depends(get_current_user)):
    """STUN is free/public; TURN credentials stay server-side in env vars
    and are only ever handed to an authenticated client here -- never
    hardcoded in frontend source."""
    return IceServersOut(ice_servers=build_ice_servers())

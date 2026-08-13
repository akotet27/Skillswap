from pydantic import BaseModel


class IceServer(BaseModel):
    urls: str
    username: str | None = None
    credential: str | None = None


class IceServersOut(BaseModel):
    ice_servers: list[IceServer]


class GuestInviteOut(BaseModel):
    join_url: str
    expires_in_minutes: int

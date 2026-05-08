from pydantic import BaseModel


class TagRef(BaseModel):
    id: str
    name: str
    color: str | None = None


class TagCreate(BaseModel):
    name: str
    color: str | None = None


class TagUpdate(BaseModel):
    name: str | None = None
    color: str | None = None

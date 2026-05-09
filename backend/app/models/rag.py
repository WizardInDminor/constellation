from pydantic import BaseModel


class PermanentCandidate(BaseModel):
    title: str
    content: str
    summary: str | None = None


class SuggestPermanentResponse(BaseModel):
    fleeting_id: str
    candidates: list[PermanentCandidate]

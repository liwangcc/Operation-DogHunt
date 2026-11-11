from typing import Literal

from pydantic import BaseModel


class OddsOutcome(BaseModel):
    selection: str
    point: float
    price: float | None = None


class OddsMarket(BaseModel):
    key: Literal["spreads", "totals"]
    updated_at: str | None = None
    outcomes: list[OddsOutcome]


class OddsBookmaker(BaseModel):
    key: str
    title: str
    markets: list[OddsMarket]


class OddsEvent(BaseModel):
    id: str
    commence_time: str
    home_team: str
    away_team: str
    bookmakers: list[OddsBookmaker]


class OddsBoard(BaseModel):
    status: Literal["available", "empty", "unavailable"]
    provider: str = "The Odds API"
    fetched_at: str | None = None
    stale: bool = True
    message: str
    events: list[OddsEvent] = []
    quota: dict[str, str | None] | None = None

from pydantic import BaseModel
from typing import Optional, Generic, TypeVar
from uuid import UUID

T = TypeVar('T')

class APIResponse(BaseModel, Generic[T]):
    success: bool
    message: str
    data: Optional[T] = None
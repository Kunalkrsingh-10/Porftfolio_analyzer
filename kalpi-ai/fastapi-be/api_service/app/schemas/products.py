from pydantic import BaseModel, Field, HttpUrl
from typing import List, Optional, Dict
from datetime import datetime
from uuid import uuid4

# --- 1. PRODUCT SCHEMA (Store / E-commerce) ---
class ProductBase(BaseModel):
    name: str = Field(..., min_length=3, example="Vastu Pyra Card")
    slug: str = Field(..., example="vastu-pyra-card-gold")
    description: str = Field(None, example="Best for positive energy")
    price: float = Field(..., gt=0, example=1999.00)
    stock: int = Field(default=0, example=50)
    category: str = Field(default="General", example="Pyramids")
    
    # Dynamic Attributes (Core SaaS Feature)
    # Alag alag products ke alag features ho sakte hain
    attributes: Dict[str, str] = Field(default={}, example={"material": "Brass", "size": "4 inch"})
    
    images: List[HttpUrl] = Field(default=[])
    is_active: bool = True

# DB me save hone wala model
class ProductInDB(ProductBase):
    id: str = Field(default_factory=lambda: str(uuid4()))
    seller_id: str # Link to Postgres User ID (Astrologer/Admin)
    created_at: datetime = Field(default_factory=datetime.utcnow)

# --- 2. ORDER SCHEMA (Checkout) ---
class OrderItem(BaseModel):
    product_id: str
    name: str
    quantity: int
    price_at_purchase: float # Price change hone par purana price safe rahe

class OrderCreate(BaseModel):
    items: List[OrderItem]
    shipping_address: Dict[str, str]
    payment_method: str = "Razorpay"

class OrderInDB(OrderCreate):
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str  # Link to Postgres User ID (Customer)
    total_amount: float
    status: str = "pending" # 'pending', 'paid', 'shipped', 'delivered'
    created_at: datetime = Field(default_factory=datetime.utcnow)

# --- 3. BOOKING SCHEMA (Consultancy/Astrology) ---
class BookingCreate(BaseModel):
    astrologer_id: str # Link to Postgres User (Role: Astrologer)
    slot_datetime: datetime
    problem_description: str

class BookingInDB(BookingCreate):
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str # Link to Postgres User (Customer)
    status: str = "scheduled" # 'scheduled', 'completed', 'cancelled'
    meeting_link: Optional[HttpUrl] = None
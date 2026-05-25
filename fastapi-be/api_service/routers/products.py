from fastapi import Request

# GET /products
async def index(request: Request):
    # Auth user access karo jo middleware ne set kiya tha
    current_user = request.state.user 
    return {
        "message": "List of products",
        "requested_by": current_user["id"]
    }

# # GET /products/{id}
# async def get_by_id(id: str):
#     return {"product_id": id, "name": "Vastu Compass", "price": 500}

# # POST /products
# async def create(data: dict):
#     return {"status": "created", "data": data}

# # PUT /products/{id}
# async def update(id: str, data: dict):
#     return {"status": "updated", "id": id, "changes": data}

# # DELETE /products/{id}
# async def delete(id: str):
#     return {"status": "deleted", "id": id}
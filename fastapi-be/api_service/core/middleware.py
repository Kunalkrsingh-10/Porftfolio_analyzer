from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from fastapi import Request

class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # 1. Public Routes (Jo bina login ke chalengi)
        public_routes = ["/", "/docs", "/openapi.json", "/redoc"]
        if request.url.path in public_routes:
            return await call_next(request)

        # 2. Token Extraction
        auth_header = request.headers.get("Authorization")
        
        if not auth_header or not auth_header.startswith("Bearer "):
            # Agar token nahi hai, to 401 Unauthorized return karo
            return JSONResponse(
                status_code=401, 
                content={"detail": "Missing or invalid authentication token"}
            )

        token = auth_header.split(" ")[1]

        try:
            # Yahan apna JWT decoding logic lagao.
            # Example ke liye dummy decoding kar rahe hain:
            if token == "magic-token": # Replace with actual JWT verification
                user_data = {"id": "user_123", "role": "admin"} # Extracted from token
                request.state.user = user_data  # ✨ User ab har route me available hai
            else:
                raise Exception("Invalid Token")
                
        except Exception as e:
            return JSONResponse(status_code=401, content={"detail": "Invalid Token"})

        response = await call_next(request)
        return response



# from starlette.middleware.base import BaseHTTPMiddleware
# from starlette.responses import JSONResponse
# from fastapi import Request
# from jose import jwt
# from config import Config

# class AuthMiddleware(BaseHTTPMiddleware):
#     async def dispatch(self, request: Request, call_next):
#         # 1. Skip paths check (Flask wale paths ignore karo)
#         if request.url.path.startswith("/auth") or request.url.path in ["/", "/docs", "/openapi.json"]:
#             return await call_next(request)

#         # 2. Token Check
#         auth_header = request.headers.get("Authorization")
#         if not auth_header or not auth_header.startswith("Bearer "):
#             return JSONResponse(status_code=401, content={"detail": "Token Missing (Login via Flask first)"})

#         token = auth_header.split(" ")[1]

#         try:
#             # 3. Use Shared Secret to Decode
#             payload = jwt.decode(token, Config.SECRET_KEY, algorithms=[Config.ALGORITHM])
#             request.state.user = payload # User verified!
#         except Exception as e:
#             return JSONResponse(status_code=401, content={"detail": "Invalid Token"})

#         return await call_next(request)

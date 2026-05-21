# import os
# import importlib.util
# from fastapi import FastAPI, APIRouter

# def load_module_from_path(file_path: str, module_name: str):
#     spec = importlib.util.spec_from_file_location(module_name, file_path)
#     if spec and spec.loader:
#         module = importlib.util.module_from_spec(spec)
#         spec.loader.exec_module(module)
#         return module
#     return None

# def register_magic_routes(app: FastAPI, routes_dir: str):
#     SUPPORTED_METHODS = ["get", "post", "put", "delete", "patch"]
    
#     print(f"🪄  Scanning magic routes with Swagger Docs...")

#     for root, dirs, files in os.walk(routes_dir):
#         for filename in files:
#             if filename.endswith(".py") and filename != "__init__.py":
#                 full_path = os.path.join(root, filename)
#                 rel_path = os.path.relpath(full_path, routes_dir)
                
#                 # Path Construction
#                 route_path = rel_path.replace("\\", "/").replace(".py", "")
#                 if route_path.endswith("/index"):
#                     route_path = route_path[:-6]
#                 elif route_path == "index":
#                     route_path = ""
                
#                 fastapi_path = "/" + route_path.replace("[", "{").replace("]", "}")
#                 if fastapi_path.endswith("/") and len(fastapi_path) > 1:
#                     fastapi_path = fastapi_path[:-1]

#                 # Module Load
#                 module_name = "dynamic_route_" + rel_path.replace("/", "_").replace("\\", "_").replace(".", "_")
#                 module = load_module_from_path(full_path, module_name)

#                 if module:
#                     router = APIRouter()
                    
#                     # --- 🌟 NEW: Read Metadata from File ---
#                     # Default Tag = Folder Name (e.g., 'users')
#                     default_tag = route_path.split("/")[0].capitalize() if route_path else "General"
                    
#                     # Agar file me ROUTE_CONFIG hai to use karo, warna empty dict
#                     config = getattr(module, "ROUTE_CONFIG", {})
#                     tags = config.get("tags", [default_tag])

#                     has_route = False
#                     for method in SUPPORTED_METHODS:
#                         if hasattr(module, method):
#                             handler = getattr(module, method)
                            
#                             # Get specific config for this method (get, post, etc.)
#                             method_config = config.get(method, {})
                            
#                             router.add_api_route(
#                                 path=fastapi_path,
#                                 endpoint=handler,
#                                 methods=[method.upper()],
#                                 tags=tags,
#                                 # Swagger UI Details
#                                 summary=method_config.get("summary", f"{method.upper()} {fastapi_path}"),
#                                 description=method_config.get("description", handler.__doc__), # Docstring as fallback
#                                 status_code=method_config.get("status_code", 200),
#                                 response_model=method_config.get("response_model", None)
#                             )
#                             has_route = True
                    
#                     if has_route:
#                         app.include_router(router)
#                         print(f"✅ Route: {fastapi_path} | Tags: {tags}")



import os
import importlib.util
from fastapi import FastAPI, APIRouter

def load_module_from_path(file_path: str, module_name: str):
    """
    Helper: Kisi bhi path se Python file load karne ke liye.
    """
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec and spec.loader:
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    return None

def register_magic_routes(app: FastAPI, routes_dir: str, api_prefix: str = ""):
    """
    Magic Function: Folder scan karke automatic routes banayega.
    Args:
        app: FastAPI Instance
        routes_dir: Folder path (e.g., 'app/v1')
        api_prefix: URL ke aage kya lagana hai (e.g., '/v1')
    """
    SUPPORTED_METHODS = ["get", "post", "put", "delete", "patch"]
    
    print(f"🪄  Scanning magic routes in '{routes_dir}' with prefix '{api_prefix}'...")

    # Ensure directory exists
    if not os.path.exists(routes_dir):
        print(f"⚠️  Warning: Directory '{routes_dir}' not found. Skipping magic routes.")
        return

    for root, dirs, files in os.walk(routes_dir):
        for filename in files:
            if filename.endswith(".py") and filename != "__init__.py":
                full_path = os.path.join(root, filename)
                rel_path = os.path.relpath(full_path, routes_dir)
                
                # 1. URL Path Calculation
                route_path = rel_path.replace("\\", "/").replace(".py", "")
                
                # 'index' file ko root path maano
                if route_path.endswith("/index"):
                    route_path = route_path[:-6]
                elif route_path == "index":
                    route_path = ""
                
                # Dynamic Params: [id] -> {id}
                fastapi_path = "/" + route_path.replace("[", "{").replace("]", "}")
                
                # Double slash safai
                if fastapi_path.endswith("/") and len(fastapi_path) > 1:
                    fastapi_path = fastapi_path[:-1]

                # 2. Module Load
                module_name = "dynamic_route_" + rel_path.replace("/", "_").replace("\\", "_").replace(".", "_")
                module = load_module_from_path(full_path, module_name)

                if module:
                    router = APIRouter()
                    
                    # 3. Metadata Extraction (Swagger Tags)
                    default_tag = route_path.split("/")[0].capitalize() if route_path else "General"
                    config = getattr(module, "ROUTE_CONFIG", {})
                    tags = config.get("tags", [default_tag])

                    has_route = False
                    for method in SUPPORTED_METHODS:
                        if hasattr(module, method):
                            handler = getattr(module, method)
                            method_config = config.get(method, {})
                            
                            # Add Route
                            router.add_api_route(
                                path=fastapi_path,
                                endpoint=handler,
                                methods=[method.upper()],
                                tags=tags,
                                summary=method_config.get("summary", f"{method.upper()} {fastapi_path}"),
                                description=method_config.get("description", handler.__doc__),
                                status_code=method_config.get("status_code", 200),
                                response_model=method_config.get("response_model", None)
                            )
                            has_route = True
                    
                    # 4. Final Registration
                    if has_route:
                        # Yahan magic prefix judega
                        app.include_router(router, prefix=api_prefix)
                        print(f"✅ Loaded: {api_prefix}{fastapi_path} | Tags: {tags}")
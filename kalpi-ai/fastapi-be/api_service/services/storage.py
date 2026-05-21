import os
import shutil
from fastapi import UploadFile
from api_service.core.config import settings

class StorageService:
    async def upload(self, file: UploadFile, folder: str = "uploads"):
        mode = settings.STORAGE_TYPE
        
        if mode == "local":
            return await self._save_local(file, folder)
        elif mode == "cloudinary":
            return await self._save_cloudinary(file, folder)
        elif mode == "b2":
            return await self._save_b2(file, folder)
    
    async def _save_local(self, file: UploadFile, folder: str):
        os.makedirs(folder, exist_ok=True)
        file_path = f"{folder}/{file.filename}"
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"url": file_path, "provider": "local"}

    async def _save_cloudinary(self, file: UploadFile, folder: str):
        # Import cloudinary logic here
        return {"url": "https://res.cloudinary.com/...", "provider": "cloudinary"}

    async def _save_b2(self, file: UploadFile, folder: str):
        # B2 logic here
        return {"url": "https://f002.backblazeb2.com/...", "provider": "b2"}

storage_service = StorageService()
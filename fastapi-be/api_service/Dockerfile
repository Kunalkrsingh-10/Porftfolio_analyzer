FROM python:3.13-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

COPY requirements.txt .
RUN pip install --default-timeout=1000 --no-cache-dir \
    --trusted-host pypi.org --trusted-host files.pythonhosted.org \
    -r requirements.txt

COPY . .
EXPOSE 8000
# Railway injects $PORT at runtime — fall back to 8000 for local Docker
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
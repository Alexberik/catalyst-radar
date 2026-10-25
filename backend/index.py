"""Vercel serverless entrypoint for the FastAPI backend."""
from app.main import app

# Vercel discovers the ASGI application exported as `app`.

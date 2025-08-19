"""Import all models through registry to ensure proper initialization order."""
from app.models.registry import *  # noqa: F401, F403
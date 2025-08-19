"""Custom exceptions for the application."""

from typing import Any, Dict, Optional


class ApplicationError(Exception):
    """Base exception for all application errors."""
    
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class ValidationError(ApplicationError):
    """Raised when validation fails."""
    
    def __init__(self, message: str, field: Optional[str] = None, details: Optional[Dict[str, Any]] = None):
        super().__init__(message, details)
        self.field = field
        if field:
            self.details["field"] = field


class NotFoundError(ApplicationError):
    """Raised when a requested resource is not found."""
    pass


class AuthenticationError(ApplicationError):
    """Raised when authentication fails."""
    pass


class AuthorizationError(ApplicationError):
    """Raised when authorization fails."""
    pass


class ConflictError(ApplicationError):
    """Raised when there's a conflict with existing data."""
    pass


class BusinessLogicError(ApplicationError):
    """Raised when business logic constraints are violated."""
    pass
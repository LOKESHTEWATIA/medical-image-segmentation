import uuid
import time
from datetime import datetime
from typing import Optional, Dict, Any
from contextvars import ContextVar
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.database import AuditLog

logger = structlog.get_logger(__name__)

# Context variable for request ID
request_id_var: ContextVar[str] = ContextVar("request_id", default="")


class AuditMiddleware(BaseHTTPMiddleware):
    """Middleware for audit logging all requests."""
    
    def __init__(self, app: ASGIApp, enabled: bool = True):
        super().__init__(app)
        self.enabled = enabled
    
    async def dispatch(self, request: Request, call_next):
        if not self.enabled:
            return await call_next(request)
        
        # Generate request ID
        request_id = str(uuid.uuid4())
        request_id_var.set(request_id)
        request.state.request_id = request_id
        
        # Start timing
        start_time = time.time()
        
        # Get user info if available
        user_id = None
        if hasattr(request.state, "user"):
            user_id = request.state.user.id
        
        # Log request
        await self._log_request(request, user_id, request_id)
        
        try:
            response = await call_next(request)
            
            # Log response
            duration_ms = int((time.time() - start_time) * 1000)
            await self._log_response(request, response, user_id, request_id, duration_ms)
            
            # Add request ID to response headers
            response.headers["X-Request-ID"] = request_id
            
            return response
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            await self._log_error(request, e, user_id, request_id, duration_ms)
            raise
    
    async def _log_request(
        self,
        request: Request,
        user_id: Optional[str],
        request_id: str,
    ):
        """Log incoming request."""
        # Skip health checks and static files
        if request.url.path in ["/health", "/healthz", "/ready", "/metrics"]:
            return
        
        # Determine event category from path
        path = request.url.path
        if path.startswith("/api/v1/auth"):
            category = "auth"
        elif path.startswith("/api/v1/tasks"):
            category = "data"
        elif path.startswith("/api/v1/models"):
            category = "model"
        elif path.startswith("/api/v1/admin"):
            category = "admin"
        else:
            category = "system"
        
        # Extract client IP
        client_ip = self._get_client_ip(request)
        
        await self._write_audit_log(
            user_id=user_id,
            event_type=f"request_{request.method.lower()}",
            event_category=category,
            description=f"{request.method} {path}",
            ip_address=client_ip,
            user_agent=request.headers.get("user-agent"),
            request_id=request_id,
            resource_type="api_endpoint",
            resource_id=path,
            success=True,
            extra_data={
                "method": request.method,
                "path": path,
                "query_params": dict(request.query_params),
            },
        )
    
    async def _log_response(
        self,
        request: Request,
        response: Response,
        user_id: Optional[str],
        request_id: str,
        duration_ms: int,
    ):
        """Log response."""
        if request.url.path in ["/health", "/healthz", "/ready", "/metrics"]:
            return
        
        path = request.url.path
        if path.startswith("/api/v1/auth"):
            category = "auth"
        elif path.startswith("/api/v1/tasks"):
            category = "data"
        elif path.startswith("/api/v1/models"):
            category = "model"
        elif path.startswith("/api/v1/admin"):
            category = "admin"
        else:
            category = "system"
        
        success = response.status_code < 400
        
        await self._write_audit_log(
            user_id=user_id,
            event_type=f"response_{request.method.lower()}",
            event_category=category,
            description=f"{request.method} {path} - {response.status_code}",
            ip_address=self._get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
            request_id=request_id,
            resource_type="api_endpoint",
            resource_id=path,
            success=success,
            extra_data={
                "method": request.method,
                "path": path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
            },
        )
    
    async def _log_error(
        self,
        request: Request,
        error: Exception,
        user_id: Optional[str],
        request_id: str,
        duration_ms: int,
    ):
        """Log error."""
        await self._write_audit_log(
            user_id=user_id,
            event_type="request_error",
            event_category="system",
            description=f"{request.method} {request.url.path} - {type(error).__name__}",
            ip_address=self._get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
            request_id=request_id,
            resource_type="api_endpoint",
            resource_id=request.url.path,
            success=False,
            error_code=type(error).__name__,
            error_message=str(error),
            extra_data={
                "method": request.method,
                "path": request.url.path,
                "duration_ms": duration_ms,
            },
        )
    
    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP address."""
        # Check X-Forwarded-For header (for reverse proxies)
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        
        # Check X-Real-IP header
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip
        
        # Fallback to client host
        if request.client:
            return request.client.host
        
        return "unknown"
    
    async def _write_audit_log(
        self,
        user_id: Optional[str],
        event_type: str,
        event_category: str,
        description: str,
        ip_address: Optional[str],
        user_agent: Optional[str],
        request_id: str,
        resource_type: Optional[str],
        resource_id: Optional[str],
        success: bool,
        error_code: Optional[str] = None,
        error_message: Optional[str] = None,
        extra_data: Optional[Dict[str, Any]] = None,
    ):
        """Write audit log entry to database."""
        try:
            async with AsyncSessionLocal() as session:
                audit_log = AuditLog(
                    user_id=uuid.UUID(user_id) if user_id else None,
                    event_type=event_type,
                    event_category=event_category,
                    description=description,
                    ip_address=ip_address,
                    user_agent=user_agent,
                    request_id=request_id,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    success=success,
                    error_code=error_code,
                    error_message=error_message,
                    extra_data=extra_data,
                )
                session.add(audit_log)
                await session.commit()
        except Exception as e:
            # Don't let audit logging failures break the request
            logger.error("audit_log_failed", error=str(e))


class AuditService:
    """Service for writing custom audit log entries."""
    
    @staticmethod
    async def log_event(
        user_id: Optional[str],
        event_type: str,
        event_category: str,
        description: str,
        task_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        success: bool = True,
        error_code: Optional[str] = None,
        error_message: Optional[str] = None,
        extra_data: Optional[Dict[str, Any]] = None,
    ):
        """Log a custom audit event."""
        try:
            async with AsyncSessionLocal() as session:
                audit_log = AuditLog(
                    user_id=uuid.UUID(user_id) if user_id else None,
                    task_id=uuid.UUID(task_id) if task_id else None,
                    event_type=event_type,
                    event_category=event_category,
                    description=description,
                    ip_address=ip_address,
                    user_agent=user_agent,
                    request_id=request_id_var.get(""),
                    resource_type=resource_type,
                    resource_id=resource_id,
                    success=success,
                    error_code=error_code,
                    error_message=error_message,
                    extra_data=extra_data,
                )
                session.add(audit_log)
                await session.commit()
        except Exception as e:
            logger.error("audit_service_log_failed", error=str(e))
    
    @staticmethod
    async def log_login(user_id: str, ip_address: str, user_agent: str, success: bool, error: str = None):
        """Log login attempt."""
        await AuditService.log_event(
            user_id=user_id,
            event_type="login",
            event_category="auth",
            description=f"User login {'successful' if success else 'failed'}",
            ip_address=ip_address,
            user_agent=user_agent,
            resource_type="user",
            resource_id=user_id,
            success=success,
            error_message=error,
        )
    
    @staticmethod
    async def log_upload(user_id: str, task_id: str, filename: str, file_size: int, ip_address: str):
        """Log file upload."""
        await AuditService.log_event(
            user_id=user_id,
            event_type="file_upload",
            event_category="data",
            description=f"Uploaded file: {filename} ({file_size} bytes)",
            task_id=task_id,
            ip_address=ip_address,
            resource_type="task",
            resource_id=task_id,
            extra_data={"filename": filename, "file_size": file_size},
        )
    
    @staticmethod
    async def log_inference(user_id: str, task_id: str, model_name: str, duration_ms: int, success: bool, error: str = None):
        """Log inference execution."""
        await AuditService.log_event(
            user_id=user_id,
            event_type="inference",
            event_category="model",
            description=f"Model inference: {model_name}",
            task_id=task_id,
            resource_type="task",
            resource_id=task_id,
            success=success,
            error_message=error,
            extra_data={"model": model_name, "duration_ms": duration_ms},
        )
    
    @staticmethod
    async def log_download(user_id: str, task_id: str, file_type: str, ip_address: str):
        """Log file download."""
        await AuditService.log_event(
            user_id=user_id,
            event_type="file_download",
            event_category="data",
            description=f"Downloaded {file_type}",
            task_id=task_id,
            ip_address=ip_address,
            resource_type="task",
            resource_id=task_id,
            extra_data={"file_type": file_type},
        )
    
    @staticmethod
    async def log_admin_action(user_id: str, action: str, target_type: str, target_id: str, ip_address: str, success: bool, error: str = None):
        """Log admin action."""
        await AuditService.log_event(
            user_id=user_id,
            event_type="admin_action",
            event_category="admin",
            description=f"Admin action: {action} on {target_type}",
            ip_address=ip_address,
            resource_type=target_type,
            resource_id=target_id,
            success=success,
            error_message=error,
            extra_data={"action": action},
        )
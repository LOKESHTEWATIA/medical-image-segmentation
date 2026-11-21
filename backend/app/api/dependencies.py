from typing import Optional, List
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, APIKeyHeader
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import structlog

from app.db.session import get_db
from app.core.security import decode_token, decode_refresh_token, hash_token
from app.models.database import User, UserRole, UserStatus, APIKey

logger = structlog.get_logger(__name__)

# Security schemes
bearer_scheme = HTTPBearer(auto_error=False)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


class CurrentUser:
    """Current authenticated user with permissions."""
    
    def __init__(
        self,
        id: str,
        email: str,
        username: str,
        full_name: str,
        role: UserRole,
        status: UserStatus,
        scopes: List[str],
        mfa_verified: bool = False,
    ):
        self.id = id
        self.email = email
        self.username = username
        self.full_name = full_name
        self.role = role
        self.status = status
        self.scopes = scopes
        self.mfa_verified = mfa_verified
    
    def has_scope(self, scope: str) -> bool:
        """Check if user has specific scope."""
        return scope in self.scopes or "admin" in self.scopes
    
    def has_role(self, *roles: UserRole) -> bool:
        """Check if user has any of the specified roles."""
        return self.role in roles
    
    def is_admin(self) -> bool:
        return self.role == UserRole.ADMIN
    
    def is_radiologist(self) -> bool:
        return self.role in [UserRole.ADMIN, UserRole.RADIOLOGIST]
    
    def can_access_task(self, task_user_id: str) -> bool:
        """Check if user can access a task (owner or admin)."""
        return self.is_admin() or self.id == task_user_id


# Role-based scopes
ROLE_SCOPES = {
    UserRole.ADMIN: [
        "admin:users", "admin:models", "admin:audit", "admin:system",
        "tasks:create", "tasks:read", "tasks:update", "tasks:delete",
        "tasks:read_all", "models:read", "models:manage",
    ],
    UserRole.RADIOLOGIST: [
        "tasks:create", "tasks:read", "tasks:update",
        "models:read",
    ],
    UserRole.RESEARCHER: [
        "tasks:create", "tasks:read",
        "models:read",
    ],
    UserRole.VIEWER: [
        "tasks:read",
        "models:read",
    ],
}


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    """Get current authenticated user from JWT token."""
    
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token_data = decode_token(credentials.credentials)
    if not token_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Get user from database
    result = await db.execute(select(User).where(User.id == token_data.sub))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is {user.status.value}",
        )
    
    # Check if token was issued before password change
    if user.password_changed_at and token_data.iat < int(user.password_changed_at.timestamp()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalidated due to password change",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Get scopes from role
    scopes = ROLE_SCOPES.get(user.role, [])
    scopes.extend(token_data.scopes)  # Additional scopes from token
    
    return CurrentUser(
        id=str(user.id),
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        status=user.status,
        scopes=list(set(scopes)),  # Deduplicate
        mfa_verified=user.mfa_enabled,  # Simplified - would check MFA status in real impl
    )


async def get_current_user_optional(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> Optional[CurrentUser]:
    """Get current user if authenticated, otherwise return None."""
    try:
        return await get_current_user(request, credentials, db)
    except HTTPException:
        return None


async def get_api_key_user(
    api_key: Optional[str] = Depends(api_key_header),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    """Authenticate via API key."""
    
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key required",
            headers={"WWW-Authenticate": "APIKey"},
        )
    
    key_hash = hash_token(api_key)
    
    result = await db.execute(
        select(APIKey, User)
        .join(User, APIKey.user_id == User.id)
        .where(APIKey.key_hash == key_hash)
        .where(APIKey.revoked_at.is_(None))
        .where(User.status == UserStatus.ACTIVE)
    )
    row = result.first()
    
    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked API key",
            headers={"WWW-Authenticate": "APIKey"},
        )
    
    api_key_obj, user = row
    
    # Check expiration
    if api_key_obj.expires_at and api_key_obj.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key expired",
        )
    
    # Update last used
    api_key_obj.last_used_at = datetime.utcnow()
    await db.commit()
    
    scopes = ROLE_SCOPES.get(user.role, [])
    if api_key_obj.scopes:
        scopes.extend(api_key_obj.scopes)
    
    return CurrentUser(
        id=str(user.id),
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        status=user.status,
        scopes=list(set(scopes)),
    )


def require_scope(scope: str):
    """Dependency factory for requiring specific scope."""
    async def scope_checker(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if not current_user.has_scope(scope):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required scope: {scope}",
            )
        return current_user
    return scope_checker


def require_role(*roles: UserRole):
    """Dependency factory for requiring specific role."""
    async def role_checker(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if not current_user.has_role(*roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required role: {[r.value for r in roles]}",
            )
        return current_user
    return role_checker


# Common scope dependencies
require_admin = require_scope("admin:system")
require_radiologist = require_role(UserRole.ADMIN, UserRole.RADIOLOGIST)
require_task_create = require_scope("tasks:create")
require_task_read = require_scope("tasks:read")
require_task_delete = require_scope("tasks:delete")
require_model_manage = require_scope("admin:models")
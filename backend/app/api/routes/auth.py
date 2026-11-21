from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr, Field
import structlog

from app.db.session import get_db
from app.core.security import (
    verify_password,
    get_password_hash,
    create_token_pair,
    decode_refresh_token,
    hash_token,
    validate_password_strength,
    generate_reset_token,
    hash_reset_token,
    verify_reset_token,
)
from app.core.audit import AuditService
from app.models.database import User, UserRole, UserStatus
from app.api.dependencies import get_current_user, CurrentUser, require_admin

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/auth", tags=["authentication"])


# Request/Response models
class UserRegister(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=12)
    full_name: str = Field(..., min_length=1, max_length=255)
    institution: Optional[str] = Field(None, max_length=255)
    department: Optional[str] = Field(None, max_length=255)
    orcid: Optional[str] = Field(None, pattern=r"^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$")


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=12)


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(..., min_length=12)


class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    full_name: str
    role: str
    status: str
    institution: Optional[str]
    department: Optional[str]
    orcid: Optional[str]
    created_at: datetime
    last_login: Optional[datetime]
    mfa_enabled: bool


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserRegister,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Register a new user."""
    
    # Check if email exists
    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    
    # Check if username exists
    result = await db.execute(select(User).where(User.username == user_data.username))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken",
        )
    
    # Validate password strength
    is_valid, errors = validate_password_strength(user_data.password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="; ".join(errors),
        )
    
    # Create user
    hashed_password = get_password_hash(user_data.password)
    user = User(
        email=user_data.email,
        username=user_data.username,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        institution=user_data.institution,
        department=user_data.department,
        orcid=user_data.orcid,
        role=UserRole.VIEWER,  # Default role, admin can upgrade
        status=UserStatus.PENDING_VERIFICATION,
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    # Log audit
    await AuditService.log_event(
        user_id=str(user.id),
        event_type="user_registered",
        event_category="auth",
        description=f"New user registered: {user.email}",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        resource_type="user",
        resource_id=str(user.id),
        success=True,
    )
    
    logger.info("user_registered", user_id=str(user.id), email=user.email)
    
    return UserResponse(
        id=str(user.id),
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        role=user.role.value,
        status=user.status.value,
        institution=user.institution,
        department=user.department,
        orcid=user.orcid,
        created_at=user.created_at,
        last_login=user.last_login,
        mfa_enabled=user.mfa_enabled,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate user and return tokens."""
    
    # Find user by email
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()
    
    if not user:
        await AuditService.log_login(
            user_id="unknown",
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent") if request else None,
            success=False,
            error="User not found",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check account status
    if user.status == UserStatus.LOCKED:
        if user.locked_until and user.locked_until > datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account temporarily locked due to failed attempts",
            )
        else:
            # Unlock expired lockout
            user.status = UserStatus.ACTIVE
            user.failed_login_attempts = 0
            user.locked_until = None
    
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is {user.status.value}",
        )
    
    # Verify password
    if not verify_password(form_data.password, user.hashed_password):
        # Increment failed attempts
        user.failed_login_attempts += 1
        
        if user.failed_login_attempts >= 5:
            user.status = UserStatus.LOCKED
            user.locked_until = datetime.utcnow() + timedelta(minutes=30)
        
        await db.commit()
        
        await AuditService.log_login(
            user_id=str(user.id),
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent") if request else None,
            success=False,
            error="Invalid password",
        )
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Reset failed attempts on successful login
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login = datetime.utcnow()
    user.status = UserStatus.ACTIVE
    await db.commit()
    
    # Create tokens
    scopes = []  # Additional scopes beyond role
    tokens = create_token_pair(
        subject=str(user.id),
        email=user.email,
        role=user.role.value,
        scopes=scopes,
    )
    
    # Log audit
    await AuditService.log_login(
        user_id=str(user.id),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent") if request else None,
        success=True,
    )
    
    logger.info("user_login", user_id=str(user.id), email=user.email)
    
    return TokenResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        token_type=tokens.token_type,
        expires_in=tokens.expires_in,
        user={
            "id": str(user.id),
            "email": user.email,
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role.value,
        },
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    token_data: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    """Refresh access token using refresh token."""
    
    payload = decode_refresh_token(token_data.refresh_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )
    
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user or user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    
    # Create new token pair
    tokens = create_token_pair(
        subject=str(user.id),
        email=user.email,
        role=user.role.value,
    )
    
    return TokenResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        token_type=tokens.token_type,
        expires_in=tokens.expires_in,
        user={
            "id": str(user.id),
            "email": user.email,
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role.value,
        },
    )


@router.post("/logout")
async def logout(
    current_user: CurrentUser = Depends(get_current_user),
    request: Request = None,
):
    """Logout user (client-side token removal)."""
    
    await AuditService.log_event(
        user_id=current_user.id,
        event_type="logout",
        event_category="auth",
        description="User logged out",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        resource_type="user",
        resource_id=current_user.id,
        success=True,
    )
    
    return {"message": "Successfully logged out"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user profile."""
    
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    
    return UserResponse(
        id=str(user.id),
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        role=user.role.value,
        status=user.status.value,
        institution=user.institution,
        department=user.department,
        orcid=user.orcid,
        created_at=user.created_at,
        last_login=user.last_login,
        mfa_enabled=user.mfa_enabled,
    )


@router.patch("/me", response_model=UserResponse)
async def update_profile(
    full_name: Optional[str] = None,
    institution: Optional[str] = None,
    department: Optional[str] = None,
    orcid: Optional[str] = None,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update current user profile."""
    
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    
    if full_name is not None:
        user.full_name = full_name
    if institution is not None:
        user.institution = institution
    if department is not None:
        user.department = department
    if orcid is not None:
        user.orcid = orcid
    
    user.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(user)
    
    return UserResponse(
        id=str(user.id),
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        role=user.role.value,
        status=user.status.value,
        institution=user.institution,
        department=user.department,
        orcid=user.orcid,
        created_at=user.created_at,
        last_login=user.last_login,
        mfa_enabled=user.mfa_enabled,
    )


@router.post("/change-password")
async def change_password(
    password_data: PasswordChange,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change user password."""
    
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    
    # Verify current password
    if not verify_password(password_data.current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    
    # Validate new password
    is_valid, errors = validate_password_strength(password_data.new_password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="; ".join(errors),
        )
    
    # Hash and update
    user.hashed_password = get_password_hash(password_data.new_password)
    user.password_changed_at = datetime.utcnow()
    user.updated_at = datetime.utcnow()
    await db.commit()
    
    await AuditService.log_event(
        user_id=current_user.id,
        event_type="password_changed",
        event_category="auth",
        description="Password changed",
        resource_type="user",
        resource_id=current_user.id,
        success=True,
    )
    
    return {"message": "Password changed successfully"}


@router.post("/forgot-password")
async def forgot_password(
    reset_data: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
):
    """Request password reset."""
    
    result = await db.execute(select(User).where(User.email == reset_data.email))
    user = result.scalar_one_or_none()
    
    # Always return success to prevent email enumeration
    if not user:
        return {"message": "If the email exists, a reset link has been sent"}
    
    # Generate reset token
    reset_token = generate_reset_token()
    hashed_token = hash_reset_token(reset_token)
    
    # Store token (in production, use Redis with expiry)
    # For now, we'll add a field to user model
    # user.reset_token_hash = hashed_token
    # user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
    
    # Send email (placeholder)
    logger.info("password_reset_requested", user_id=str(user.id), email=user.email)
    
    return {"message": "If the email exists, a reset link has been sent"}


@router.post("/reset-password")
async def reset_password(
    reset_data: PasswordResetConfirm,
    db: AsyncSession = Depends(get_db),
):
    """Confirm password reset."""
    
    # In production, look up user by token from Redis
    # For now, placeholder
    return {"message": "Password reset functionality requires email integration"}


# Admin routes
@router.get("/admin/users", response_model=list[UserResponse])
async def list_users(
    skip: int = 0,
    limit: int = 100,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all users (admin only)."""
    
    result = await db.execute(
        select(User).offset(skip).limit(limit).order_by(User.created_at.desc())
    )
    users = result.scalars().all()
    
    return [
        UserResponse(
            id=str(u.id),
            email=u.email,
            username=u.username,
            full_name=u.full_name,
            role=u.role.value,
            status=u.status.value,
            institution=u.institution,
            department=u.department,
            orcid=u.orcid,
            created_at=u.created_at,
            last_login=u.last_login,
            mfa_enabled=u.mfa_enabled,
        )
        for u in users
    ]


@router.patch("/admin/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    role: UserRole,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update user role (admin only)."""
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change own role",
        )
    
    old_role = user.role
    user.role = role
    user.updated_at = datetime.utcnow()
    await db.commit()
    
    await AuditService.log_admin_action(
        user_id=current_user.id,
        action="role_change",
        target_type="user",
        target_id=user_id,
        ip_address="",
        success=True,
        extra_data={"old_role": old_role.value, "new_role": role.value},
    )
    
    return {"message": f"Role updated to {role.value}"}


@router.patch("/admin/users/{user_id}/status")
async def update_user_status(
    user_id: str,
    status: UserStatus,
    current_user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update user status (admin only)."""
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change own status",
        )
    
    old_status = user.status
    user.status = status
    user.updated_at = datetime.utcnow()
    await db.commit()
    
    await AuditService.log_admin_action(
        user_id=current_user.id,
        action="status_change",
        target_type="user",
        target_id=user_id,
        ip_address="",
        success=True,
        extra_data={"old_status": old_status.value, "new_status": status.value},
    )
    
    return {"message": f"Status updated to {status.value}"}
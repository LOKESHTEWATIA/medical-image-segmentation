import secrets
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from jose import jwt, JWTError
from passlib.context import CryptContext
from pydantic import BaseModel
import structlog

from app.core.config import settings

logger = structlog.get_logger(__name__)

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=settings.BCRYPT_ROUNDS)


class TokenData(BaseModel):
    sub: str  # user ID
    email: str
    role: str
    scopes: List[str] = []
    exp: int
    iat: int
    jti: str  # JWT ID for revocation


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password."""
    return pwd_context.hash(password)


def validate_password_strength(password: str) -> tuple[bool, List[str]]:
    """Validate password meets security requirements."""
    errors = []
    
    if len(password) < settings.PASSWORD_MIN_LENGTH:
        errors.append(f"Password must be at least {settings.PASSWORD_MIN_LENGTH} characters")
    
    if not any(c.isupper() for c in password):
        errors.append("Password must contain at least one uppercase letter")
    
    if not any(c.islower() for c in password):
        errors.append("Password must contain at least one lowercase letter")
    
    if not any(c.isdigit() for c in password):
        errors.append("Password must contain at least one digit")
    
    if not any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password):
        errors.append("Password must contain at least one special character")
    
    # Check for common patterns
    common_patterns = ["password", "123456", "qwerty", "admin", "medseg"]
    if any(pattern in password.lower() for pattern in common_patterns):
        errors.append("Password contains common patterns")
    
    return len(errors) == 0, errors


def create_access_token(
    subject: str,
    email: str,
    role: str,
    scopes: Optional[List[str]] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create JWT access token."""
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    iat = datetime.utcnow()
    jti = secrets.token_urlsafe(16)
    
    to_encode = {
        "sub": subject,
        "email": email,
        "role": role,
        "scopes": scopes or [],
        "exp": int(expire.timestamp()),
        "iat": int(iat.timestamp()),
        "jti": jti,
        "type": "access",
    }
    
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def create_refresh_token(subject: str, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT refresh token."""
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    
    iat = datetime.utcnow()
    jti = secrets.token_urlsafe(16)
    
    to_encode = {
        "sub": subject,
        "exp": int(expire.timestamp()),
        "iat": int(iat.timestamp()),
        "jti": jti,
        "type": "refresh",
    }
    
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def create_token_pair(
    subject: str,
    email: str,
    role: str,
    scopes: Optional[List[str]] = None,
) -> TokenPair:
    """Create access and refresh token pair."""
    access_token = create_access_token(subject, email, role, scopes)
    refresh_token = create_refresh_token(subject)
    
    return TokenPair(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


def decode_token(token: str) -> Optional[TokenData]:
    """Decode and validate JWT token."""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_aud": False},
        )
        
        if payload.get("type") != "access":
            return None
        
        return TokenData(**payload)
    except JWTError as e:
        logger.warning("jwt_decode_failed", error=str(e))
        return None


def decode_refresh_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and validate refresh token."""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_aud": False},
        )
        
        if payload.get("type") != "refresh":
            return None
        
        return payload
    except JWTError as e:
        logger.warning("refresh_token_decode_failed", error=str(e))
        return None


def hash_token(token: str) -> str:
    """Create SHA-256 hash of token for storage."""
    return hashlib.sha256(token.encode()).hexdigest()


def generate_api_key() -> tuple[str, str]:
    """Generate API key and its prefix."""
    # Format: medseg_<random>
    random_part = secrets.token_urlsafe(32)
    api_key = f"medseg_{random_part}"
    prefix = api_key[:12]  # medseg_xxxxx
    return api_key, prefix


def hash_api_key(api_key: str) -> str:
    """Hash API key for storage."""
    return hashlib.sha256(api_key.encode()).hexdigest()


def generate_reset_token() -> str:
    """Generate password reset token."""
    return secrets.token_urlsafe(32)


def hash_reset_token(token: str) -> str:
    """Hash reset token for storage."""
    return hashlib.sha256(token.encode()).hexdigest()


def verify_reset_token(token: str, hashed_token: str) -> bool:
    """Verify reset token against hash."""
    return hash_reset_token(token) == hashed_token
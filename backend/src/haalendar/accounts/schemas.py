"""Request and response models of the accounts endpoints (contract: api/modules/accounts.yaml).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-160. Inputs derive from ApiModel (unknown fields rejected). Password length
is validated by the password policy atom (to report all violations together), not by the schema.
"""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from haalendar.security.schemas import ApiModel


class RegistrationIn(ApiModel):
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=1, max_length=1024)
    display_name: str = Field(min_length=1, max_length=80)
    time_zone: str = Field(min_length=1, max_length=64)
    invite_token: str | None = Field(default=None, max_length=128)


class TokenIn(ApiModel):
    token: str = Field(min_length=1, max_length=128)


class LoginIn(ApiModel):
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=1, max_length=1024)
    totp_code: str | None = Field(default=None, pattern=r"^\d{6}$")
    recovery_code: str | None = Field(default=None, max_length=32)


class MeOut(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str
    avatar_url: str | None = None
    role: Literal["admin", "user"]
    time_zone: str
    locale: Literal["en"]
    totp_enabled: bool
    must_change_password: bool
    csrf_token: str | None = None
    version: int


class LoginOut(BaseModel):
    me: MeOut
    csrf_token: str


# +++===+++ 2026-10-15 — Hasan Alizada — HAAL-161. Password reset, re-authentication, password change, admin reset.


class PasswordResetRequestIn(ApiModel):
    email: EmailStr = Field(max_length=254)


class PasswordResetConfirmIn(ApiModel):
    token: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=1, max_length=1024)


class ReauthIn(ApiModel):
    password: str = Field(min_length=1, max_length=1024)
    totp_code: str | None = Field(default=None, pattern=r"^\d{6}$")


class ChangePasswordIn(ApiModel):
    new_password: str = Field(min_length=1, max_length=1024)


class AdminUserActionOut(BaseModel):
    delivery: Literal["email", "one_time_password"] | None = None
    one_time_password: str | None = None


# +++===+++ 2026-10-15 — Hasan Alizada — HAAL-162. Two-factor authentication (TOTP) enrolment.


class TotpSetupOut(BaseModel):
    otpauth_uri: str
    secret: str


class TotpEnableIn(ApiModel):
    totp_code: str = Field(pattern=r"^\d{6}$")


class TotpEnableOut(BaseModel):
    recovery_codes: list[str]

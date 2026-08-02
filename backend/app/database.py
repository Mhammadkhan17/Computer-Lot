from fastapi import Depends
from postgrest._sync.client import SyncPostgrestClient
from postgrest.utils import SyncClient
from supabase import create_client, Client

from app.config import settings
from app.utils.security import get_access_token


# HTTP/2 connections are being terminated by Supabase server between requests.
# This is a known upstream issue in the supabase-py client (see:
# https://github.com/supabase/supabase-py/issues/438).
# Disable HTTP/2 to use reliable HTTP/1.1 connections instead.
# Review date: 2026-08-02 — re-evaluate when supabase-py ships a fix.
_orig_create_session = SyncPostgrestClient.create_session


def _patched_create_session(self, base_url, headers, timeout, verify=True):
    return SyncClient(
        base_url=base_url,
        headers=headers,
        timeout=timeout,
        verify=verify,
        follow_redirects=True,
        http2=False,
    )


SyncPostgrestClient.create_session = _patched_create_session


def get_supabase() -> Client:
    """Anonymous-key Supabase client (RLS enforced). Default for general access."""
    return create_client(settings.supabase_url, settings.supabase_anon_key)


def get_user_supabase(token: str = Depends(get_access_token)) -> Client:
    """Anonymous-key client authenticated as the caller (RLS enforced per-user)."""
    client = create_client(settings.supabase_url, settings.supabase_anon_key)
    client.postgrest.auth(token)
    return client


def get_service_role_supabase() -> Client:
    """service_role client — used ONLY by the /checkout transaction path (ADR-009)."""
    return create_client(settings.supabase_url, settings.supabase_service_role_key)

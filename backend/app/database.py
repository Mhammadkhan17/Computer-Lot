from fastapi import Depends
import httpx
from postgrest._sync.client import SyncPostgrestClient
from postgrest.constants import DEFAULT_POSTGREST_CLIENT_HEADERS
from supabase import create_client, Client

from app.config import settings
from app.utils.security import get_access_token


# HTTP/2 connections are being terminated by Supabase server between requests.
# This is a known upstream issue in the supabase-py client (see:
# https://github.com/supabase/supabase-py/issues/438).
#
# In postgrest 0.19.x the workaround was to replace the `create_session`
# classmethod. postgrest 2.x (pulled in by supabase-py >= 2.7) no longer has
# `create_session`; it builds its httpx session inline with `http2=True`.
# We instead wrap `SyncPostgrestClient.__init__` and inject our own
# HTTP/1.1 (`http2=False`) http_client, preserving the same behavior.
_orig_postgrest_init = SyncPostgrestClient.__init__


def _patched_postgrest_init(
    self,
    base_url,
    *args,
    schema="public",
    headers=None,
    timeout=None,
    verify=None,
    proxy=None,
    http_client=None,
    **kwargs,
):
    if http_client is None:
        http_client = httpx.Client(
            base_url=base_url,
            headers=headers if headers is not None else DEFAULT_POSTGREST_CLIENT_HEADERS,
            timeout=timeout,
            verify=verify,
            follow_redirects=True,
            http2=False,
        )
    _orig_postgrest_init(
        self,
        base_url,
        schema=schema,
        headers=headers if headers is not None else DEFAULT_POSTGREST_CLIENT_HEADERS,
        timeout=timeout,
        verify=verify,
        proxy=proxy,
        http_client=http_client,
        **kwargs,
    )


SyncPostgrestClient.__init__ = _patched_postgrest_init


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

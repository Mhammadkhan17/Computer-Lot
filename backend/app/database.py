from postgrest._sync.client import SyncPostgrestClient
from postgrest.utils import SyncClient
from supabase import create_client, Client

from app.config import settings


# HTTP/2 connections are being terminated by Supabase server between requests.
# Disable HTTP/2 to use reliable HTTP/1.1 connections instead.
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
    return create_client(settings.supabase_url, settings.supabase_service_role_key)

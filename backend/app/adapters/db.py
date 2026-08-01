import psycopg2
from psycopg2 import OperationalError

from app.config import settings


def get_raw_connection() -> psycopg2.extensions.connection:
    try:
        return psycopg2.connect(
            dbname=settings.supabase_db_name,
            user=settings.supabase_db_user,
            password=settings.supabase_db_password,
            host=settings.supabase_db_host,
            port=settings.supabase_db_port,
            connect_timeout=10,
            options="-c statement_timeout=30000",
        )
    except OperationalError as e:
        raise RuntimeError(f"Database connection failed: {e}")
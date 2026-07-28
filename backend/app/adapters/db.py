import psycopg2

from app.config import settings


def get_raw_connection() -> psycopg2.extensions.connection:
    return psycopg2.connect(
        dbname=settings.supabase_db_name,
        user=settings.supabase_db_user,
        password=settings.supabase_db_password,
        host=settings.supabase_db_host,
        port=settings.supabase_db_port,
    )
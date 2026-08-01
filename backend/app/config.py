from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    supabase_jwt_secret: str
    merchant_phone: str
    frontend_url: str = "http://localhost:3000"
    cors_origins: str = "http://localhost:3000"
    supabase_db_host: str = "localhost"
    supabase_db_name: str = "postgres"
    supabase_db_user: str = "postgres"
    supabase_db_password: str = ""
    supabase_db_port: int = 5432
    app_name: str = "Computer Lot Liquidation API"
    debug: bool = False

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

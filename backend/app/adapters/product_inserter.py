from supabase import Client


def insert_products(supabase: Client, rows: list[dict]) -> int:
    count = 0
    for row in rows:
        supabase.table("products").insert(row).execute()
        count += 1
    return count
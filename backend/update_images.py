"""Update product images with real product photos."""
import logging
from supabase import create_client
from app.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

IMAGE_MAP = {
    "CPU-001": [
        "https://upload.wikimedia.org/wikipedia/commons/b/bf/Intel_CPU_Core_i7_12700K_Alder_Lake_perspective.jpg"
    ],
    "CPU-002": [
        "https://upload.wikimedia.org/wikipedia/commons/f/f1/AMD%407nm%2812nmIO%29%40Zen2%40Matisse%40Ryzen_5_3600%40100-000000031_BF_1923SUT_9HM6935R90062_DSCx1.jpg"
    ],
    "RAM-001": [
        "https://dummyimage.com/600x400/b8862c/ffffff&text=DDR4+32GB+RAM",
    ],
    "SSD-001": [
        "https://upload.wikimedia.org/wikipedia/commons/a/a8/Samsung_SSD_850_PRO_512GB.jpg",
    ],
    "GPU-001": [
        "https://dummyimage.com/600x400/c95d2b/ffffff&text=NVIDIA+RTX+3060",
    ],
    "MB-001": [
        "https://dummyimage.com/600x400/b8862c/ffffff&text=ASUS+Z690-E+MB",
    ],
    "PSU-001": [
        "https://dummyimage.com/600x400/444444/ffffff&text=EVGA+750W+G5",
    ],
    "SYS-001": [
        "https://dummyimage.com/600x400/0076ce/ffffff&text=Dell+OptiPlex+7080",
    ],
    "CLR-001": [
        "https://dummyimage.com/600x400/333333/ffffff&text=Noctua+NH-D15",
    ],
    "RAM-002": [
        "https://upload.wikimedia.org/wikipedia/commons/e/e7/DDR_4_RAM_SO-DIMM_8GB_by_Samsung-top_front_PNr%C2%B00838.jpg",
    ],
}


def main():
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)

    products = supabase.table("products").select("id, sku, grade").execute()
    if not products.data:
        logger.error("No products found.")
        return

    updated = 0
    for product in products.data:
        sku = product["sku"]
        images = IMAGE_MAP.get(sku)
        if not images:
            logger.warning("  %s: no image map entry, skipping", sku)
            continue

        supabase.table("products").update({"images": images}).eq("id", product["id"]).execute()
        updated += 1
        logger.info("  %s: updated", sku)

    logger.info("Updated images for %d products.", updated)


if __name__ == "__main__":
    main()

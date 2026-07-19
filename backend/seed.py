"""Seed 10 mock products via Supabase REST API."""
import logging
from supabase import create_client
from app.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SEED_PRODUCTS = [
    {
        "title": "Intel Core i7-12700K LGA1700 CPU Lot",
        "sku": "CPU-001",
        "description": "12th Gen Alder Lake, 12 cores/20 threads, up to 5.0 GHz. Pulled from decommissioned workstations, fully tested.",
        "hardware_specifications": {"cores": 12, "threads": 20, "base_clock": "3.6GHz", "turbo_clock": "5.0GHz", "socket": "LGA1700", "tdp": "125W"},
        "grade": "Grade_A",
        "items_per_lot": 5,
        "retail_price_per_lot": 850.00,
        "wholesale_price_per_lot": 720.00,
        "minimum_wholesale_lots": 3,
        "available_stock_lots": 25,
        "images": ["https://placehold.co/400x300/1f4e79/ffffff?text=i7-12700K"],
        "tags": ["intel", "cpu", "lga1700", "alder-lake"],
    },
    {
        "title": "AMD Ryzen 5 5600X AM4 CPU Lot",
        "sku": "CPU-002",
        "description": "6 cores/12 threads, 4.6 GHz boost. Excellent condition, retail packaging.",
        "hardware_specifications": {"cores": 6, "threads": 12, "base_clock": "3.7GHz", "turbo_clock": "4.6GHz", "socket": "AM4", "tdp": "65W"},
        "grade": "Grade_A",
        "items_per_lot": 5,
        "retail_price_per_lot": 620.00,
        "wholesale_price_per_lot": 510.00,
        "minimum_wholesale_lots": 3,
        "available_stock_lots": 18,
        "images": ["https://placehold.co/400x300/45845f/ffffff?text=Ryzen+5+5600X"],
        "tags": ["amd", "cpu", "am4", "ryzen"],
    },
    {
        "title": "Corsair Vengeance DDR4 32GB (2x16GB) 3200MHz",
        "sku": "RAM-001",
        "description": "DDR4 3200MHz CL16. Tested and verified. Minor cosmetic wear on heat spreaders.",
        "hardware_specifications": {"capacity": "32GB", "type": "DDR4", "speed": "3200MHz", "form_factor": "DIMM", "cas_latency": "CL16"},
        "grade": "Grade_B",
        "items_per_lot": 10,
        "retail_price_per_lot": 240.00,
        "wholesale_price_per_lot": 190.00,
        "minimum_wholesale_lots": 5,
        "available_stock_lots": 42,
        "images": ["https://placehold.co/400x300/b8862c/ffffff?text=DDR4+32GB"],
        "tags": ["corsair", "ram", "ddr4", "memory"],
    },
    {
        "title": "Samsung 870 EVO 1TB SATA SSD Lot",
        "sku": "SSD-001",
        "description": "1TB SATA III 2.5-inch SSD. Smart data shows 95%+ health remaining. Bulk packaging.",
        "hardware_specifications": {"capacity": "1TB", "interface": "SATA III", "form_factor": "2.5-inch", "nand_type": "TLC", "health": "95%+"},
        "grade": "Grade_A",
        "items_per_lot": 5,
        "retail_price_per_lot": 380.00,
        "wholesale_price_per_lot": 310.00,
        "minimum_wholesale_lots": 5,
        "available_stock_lots": 30,
        "images": ["https://placehold.co/400x300/1f4e79/ffffff?text=870+EVO+1TB"],
        "tags": ["samsung", "ssd", "sata", "storage"],
    },
    {
        "title": "NVIDIA GeForce RTX 3060 12GB GPU Lot",
        "sku": "GPU-001",
        "description": "12GB GDDR6, 3x DisplayPort/HDMI. Pulled from mining rigs, memory ICs replaced under warranty. Includes 6-pin adapters.",
        "hardware_specifications": {"vram": "12GB GDDR6", "ports": "3x DP + 1x HDMI", "tdp": "170W", "length": "242mm"},
        "grade": "Grade_C",
        "items_per_lot": 2,
        "retail_price_per_lot": 520.00,
        "wholesale_price_per_lot": 440.00,
        "minimum_wholesale_lots": 5,
        "available_stock_lots": 12,
        "images": ["https://placehold.co/400x300/c95d2b/ffffff?text=RTX+3060"],
        "tags": ["nvidia", "gpu", "rtx", "graphics"],
    },
    {
        "title": "ASUS ROG Strix Z690-E Gaming WiFi MB Lot",
        "sku": "MB-001",
        "description": "LGA1700, DDR5, PCIe 5.0, WiFi 6E. Some bent pins (repaired), fully functional. No I/O shield.",
        "hardware_specifications": {"socket": "LGA1700", "chipset": "Z690", "memory": "DDR5", "form_factor": "ATX", "wifi": "WiFi 6E"},
        "grade": "Grade_B",
        "items_per_lot": 3,
        "retail_price_per_lot": 440.00,
        "wholesale_price_per_lot": 360.00,
        "minimum_wholesale_lots": 4,
        "available_stock_lots": 8,
        "images": ["https://placehold.co/400x300/b8862c/ffffff?text=Z690-E+MB"],
        "tags": ["asus", "motherboard", "lga1700", "ddr5"],
    },
    {
        "title": "EVGA SuperNOVA 750 G5 750W PSU Lot",
        "sku": "PSU-001",
        "description": "80+ Gold, fully modular. Tested with load tester, all rails within spec. Cables included in zip bag.",
        "hardware_specifications": {"wattage": "750W", "rating": "80+ Gold", "modular": "Full", "form_factor": "ATX"},
        "grade": "Grade_B",
        "items_per_lot": 4,
        "retail_price_per_lot": 320.00,
        "wholesale_price_per_lot": 260.00,
        "minimum_wholesale_lots": 5,
        "available_stock_lots": 15,
        "images": ["https://placehold.co/400x300/b8862c/ffffff?text=750W+G5+PSU"],
        "tags": ["evga", "psu", "power-supply", "modular"],
    },
    {
        "title": "Dell OptiPlex 7080 SFF i5-10500 Lot",
        "sku": "SYS-001",
        "description": "Small form factor, i5-10500, 16GB RAM, 256GB SSD. No OS drive included. Good for homelab or office.",
        "hardware_specifications": {"cpu": "i5-10500", "ram": "16GB DDR4", "storage": "256GB NVMe", "form_factor": "SFF", "os": "None"},
        "grade": "Grade_C",
        "items_per_lot": 2,
        "retail_price_per_lot": 280.00,
        "wholesale_price_per_lot": 230.00,
        "minimum_wholesale_lots": 5,
        "available_stock_lots": 20,
        "images": ["https://placehold.co/400x300/c95d2b/ffffff?text=OptiPlex+7080"],
        "tags": ["dell", "desktop", "optiplex", "sff"],
    },
    {
        "title": "Noctua NH-D15 Chromax CPU Cooler Lot",
        "sku": "CLR-001",
        "description": "Dual tower, dual NF-A15 fans. LGA1700/AM5 mounting included. Missing one fan clip (replaced with zip tie).",
        "hardware_specifications": {"height": "165mm", "fans": "2x NF-A15", "socket": "LGA1700/AM5", "tdp": "250W+"},
        "grade": "Grade_B",
        "items_per_lot": 3,
        "retail_price_per_lot": 240.00,
        "wholesale_price_per_lot": 195.00,
        "minimum_wholesale_lots": 4,
        "available_stock_lots": 10,
        "images": ["https://placehold.co/400x300/b8862c/ffffff?text=NH-D15+Cooler"],
        "tags": ["noctua", "cooler", "cpu-cooler", "air-cooling"],
    },
    {
        "title": "Assorted Laptop DDR4 SODIMM 8GB 3200MHz Lot",
        "sku": "RAM-002",
        "description": "Mixed brands (SK Hynix, Samsung, Micron). Pulled from laptop upgrades. Not all same brand but same spec. For Parts — no returns.",
        "hardware_specifications": {"capacity": "8GB", "type": "DDR4 SODIMM", "speed": "3200MHz", "condition": "Pulls, untested"},
        "grade": "For_Parts",
        "items_per_lot": 20,
        "retail_price_per_lot": 120.00,
        "wholesale_price_per_lot": 90.00,
        "minimum_wholesale_lots": 5,
        "available_stock_lots": 50,
        "images": ["https://placehold.co/400x300/6b4c8a/ffffff?text=Laptop+DDR4"],
        "tags": ["laptop", "ram", "ddr4", "sodimm", "for-parts"],
    },
]


if __name__ == "__main__":
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)

    inserted = 0
    for p in SEED_PRODUCTS:
        # Check if SKU already exists
        existing = supabase.table("products").select("id").eq("sku", p["sku"]).execute()
        if existing.data:
            logger.info("  Skipped (already exists): %s", p["sku"])
            continue

        resp = supabase.table("products").insert(p).execute()
        if resp.data:
            inserted += 1
            logger.info("  Inserted: %s (%s)", p["title"], resp.data[0]["id"])

    logger.info("Done — seeded %d products.", inserted)

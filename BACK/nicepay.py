import hashlib
import os
import httpx
from typing import Optional, Dict, Any

NICEPAY_API_URL = "https://nicepay.io/public/api/payment"
NICEPAY_MERCHANT_ID = os.getenv("NICEPAY_MERCHANT_ID", "")
NICEPAY_SECRET_KEY = os.getenv("NICEPAY_SECRET_KEY", "")


async def create_nicepay_payment(
    order_id: str,
    customer: str,
    amount: int,
    currency: str = "RUB",
    description: str = "",
    success_url: Optional[str] = None,
    fail_url: Optional[str] = None,
    method: Optional[str] = None,
) -> Dict[str, Any]:
    payload = {
        "merchant_id": NICEPAY_MERCHANT_ID,
        "secret": NICEPAY_SECRET_KEY,
        "order_id": order_id,
        "customer": customer,
        "amount": amount,
        "currency": currency,
        "description": description,
    }

    if success_url:
        payload["success_url"] = success_url
    if fail_url:
        payload["fail_url"] = fail_url
    if method:
        payload["method"] = method

    async with httpx.AsyncClient() as client:
        response = await client.post(NICEPAY_API_URL, json=payload, timeout=30.0)
        response.raise_for_status()
        data = response.json()

        if data.get("status") == "error":
            raise Exception(data.get("data", {}).get("message", "Payment creation failed"))

        return data.get("data", {})


def verify_webhook_hash(params: Dict[str, str], secret_key: str) -> bool:
    received_hash = params.get("hash", "")

    # Remove hash parameter
    params_copy = {k: v for k, v in params.items() if k != "hash"}

    # Sort by keys alphabetically
    sorted_keys = sorted(params_copy.keys())

    # Get values in alphabetical order of keys
    values = [str(params_copy[k]) for k in sorted_keys]

    # Append secret key at the end
    values.append(secret_key)

    # Join with {np}
    hash_string = "{np}".join(values)

    # Calculate SHA256
    calculated_hash = hashlib.sha256(hash_string.encode()).hexdigest()

    return calculated_hash == received_hash

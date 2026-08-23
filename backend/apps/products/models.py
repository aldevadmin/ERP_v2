# apps.products no longer owns any live models — Product was merged into
# apps.items.Item in Phase 2, and CustomerSKUMapping/CustomerSKUMappingFile
# were replaced by apps.customer_mappings.CustomerProductMapping (a
# versioned rebuild, see apps.customer_mappings.migrations.0003) in Phase
# 4. This app stays registered, with no API surface, purely so its
# migration history stays resolvable when replaying migrations from
# scratch on a fresh database — same reasoning as apps.materials.
from typing import Any

from django.core.exceptions import ValidationError

MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024  # 5MB
ALLOWED_UPLOAD_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
}


def validate_upload_file_size(file: Any) -> None:
    """Dead code kept only because old migrations reference this function
    object directly (not by dotted string path) on the now-deleted
    `CustomerSKUMappingFile.file` field — removing it breaks replaying
    migration history from scratch. Do not use for new code.
    """
    if file.size > MAX_UPLOAD_SIZE_BYTES:
        raise ValidationError("File must be 5MB or smaller.")


def validate_upload_file_type(file: Any) -> None:
    """Same reasoning as `validate_upload_file_size` above."""
    content_type = getattr(file, "content_type", None)
    if content_type not in ALLOWED_UPLOAD_CONTENT_TYPES:
        raise ValidationError("Only image files (JPEG, PNG, GIF, WebP) or PDF are allowed.")

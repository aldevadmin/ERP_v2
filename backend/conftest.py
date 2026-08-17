import pytest

from apps.core.models import Organization


@pytest.fixture
def organization(db) -> Organization:
    """The single organization seeded by core's data migration."""
    return Organization.objects.get(name="Default Organization")


@pytest.fixture(autouse=True)
def _media_root(tmp_path, settings) -> None:
    """Redirect file uploads (e.g. PO attachments) to a per-test temp dir
    instead of the real dev media/ folder."""
    settings.MEDIA_ROOT = tmp_path

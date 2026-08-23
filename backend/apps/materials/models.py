# apps.materials no longer owns any live models — Material was merged into
# apps.items.Item (see apps.items.migrations.0003_migrate_material_product_to_item)
# and removed by migrations.0003_delete_material. This app stays registered,
# with no API surface, purely so its migration history (and the items app's
# data migration that depends on it) stays resolvable when replaying
# migrations from scratch on a fresh database.

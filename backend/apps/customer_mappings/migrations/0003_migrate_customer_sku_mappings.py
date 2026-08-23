from decimal import Decimal

from django.db import migrations


def resolve_selling_uom(UOM, item):
    if item.inventory_uom_id:
        return item.inventory_uom_id
    return UOM.objects.filter(code="PC").values_list("id", flat=True).first()


def compute_cbm(length, breadth, height):
    if length is None or breadth is None or height is None:
        return None
    return ((length * breadth * height) / Decimal("1000000000")).quantize(Decimal("0.0001"))


def migrate_mappings(apps, schema_editor):
    CustomerSKUMapping = apps.get_model("products", "CustomerSKUMapping")
    CustomerSKUMappingFile = apps.get_model("products", "CustomerSKUMappingFile")
    UOM = apps.get_model("items", "UOM")
    PackagingProfile = apps.get_model("packaging", "PackagingProfile")
    PackagingProfileVersion = apps.get_model("packaging", "PackagingProfileVersion")
    CustomerProductMapping = apps.get_model("customer_mappings", "CustomerProductMapping")
    CustomerProductMappingVersion = apps.get_model(
        "customer_mappings", "CustomerProductMappingVersion"
    )
    MappingRequirement = apps.get_model("customer_mappings", "MappingRequirement")
    MappingFile = apps.get_model("customer_mappings", "MappingFile")

    for old in CustomerSKUMapping.objects.select_related("item", "customer").all():
        selling_uom_id = resolve_selling_uom(UOM, old.item)
        pieces_per_selling_unit = None
        if old.pieces_per_pouch and old.pouches_per_carton:
            pieces_per_selling_unit = old.pieces_per_pouch * old.pouches_per_carton
        elif old.pieces_per_pouch:
            pieces_per_selling_unit = old.pieces_per_pouch

        profile = PackagingProfile.objects.create(
            code=f"CPM-{old.id}",
            name=f"{old.item.name} — {old.customer.name}",
            finished_item_id=old.item_id,
            scope="CUSTOMER_TEMPLATE",
            organization_id=old.item.organization_id,
        )
        profile_version = PackagingProfileVersion.objects.create(
            profile=profile,
            version_number=1,
            status="PUBLISHED",
            selling_uom_id=selling_uom_id,
            pack_mode="CARTON" if old.pouches_per_carton else "POUCH",
            pieces_per_pouch=old.pieces_per_pouch,
            pouches_per_carton=old.pouches_per_carton,
            carton_length_mm=old.carton_length_mm,
            carton_breadth_mm=old.carton_breadth_mm,
            carton_height_mm=old.carton_height_mm,
            carton_net_weight_kg=old.carton_net_weight_kg,
            carton_gross_weight_kg=old.carton_gross_weight_kg,
            pieces_per_selling_unit=pieces_per_selling_unit,
            cbm=compute_cbm(old.carton_length_mm, old.carton_breadth_mm, old.carton_height_mm),
            organization_id=old.item.organization_id,
        )
        # No PackagingProfileMaterial rows: the legacy table never tracked
        # individual packaging-material items (pouch/carton SKUs), only
        # aggregate pouch/carton dimensions — a coordinator can add them
        # from Settings once this profile is in view.

        mapping = CustomerProductMapping.objects.create(
            customer_id=old.customer_id,
            item_id=old.item_id,
            mapping_code=f"CPM-{old.id}",
            is_active=True,
            organization_id=old.item.organization_id,
        )
        version = CustomerProductMappingVersion.objects.create(
            mapping=mapping,
            version_number=1,
            status="PUBLISHED",
            customer_sku=old.customer_sku_code,
            customer_description=old.customer_description,
            packaging_profile_version=profile_version,
            selling_uom_id=selling_uom_id,
            organization_id=old.item.organization_id,
        )

        sort_order = 0
        if old.has_retail_sticker:
            MappingRequirement.objects.create(
                version=version,
                category="LABEL",
                key="Retail Sticker",
                value=old.retail_sticker_comments or "Required",
                is_required=True,
                sort_order=sort_order,
                organization_id=old.item.organization_id,
            )
            sort_order += 1
        if old.has_silica_gel:
            MappingRequirement.objects.create(
                version=version,
                category="QUALITY",
                key="Silica Gel",
                value="Required",
                is_required=True,
                sort_order=sort_order,
                organization_id=old.item.organization_id,
            )
            sort_order += 1
        if old.other_packing_requirements:
            MappingRequirement.objects.create(
                version=version,
                category="OTHER",
                key="Other Packing Instructions",
                value=old.other_packing_requirements,
                is_required=False,
                sort_order=sort_order,
                organization_id=old.item.organization_id,
            )
            sort_order += 1

        for old_file in CustomerSKUMappingFile.objects.filter(customer_sku_mapping=old):
            MappingFile.objects.create(
                version=version,
                category=old_file.category,
                file=old_file.file.name,
            )


def reverse(apps, schema_editor):
    CustomerProductMapping = apps.get_model("customer_mappings", "CustomerProductMapping")
    PackagingProfile = apps.get_model("packaging", "PackagingProfile")
    CustomerProductMapping.objects.filter(mapping_code__startswith="CPM-").delete()
    PackagingProfile.objects.filter(code__startswith="CPM-").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("customer_mappings", "0002_initial"),
        ("packaging", "0001_initial"),
        ("products", "0007_delete_product"),
    ]

    operations = [
        migrations.RunPython(migrate_mappings, reverse),
    ]

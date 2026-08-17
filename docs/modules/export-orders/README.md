# Export Order Management

The first business module on this ERP platform. Read in this order:

1. [functional-spec.md](functional-spec.md) — business intent, workflow, and requirements (source of truth for *what*).
2. [domain-model.md](domain-model.md) — entities, app boundaries, reusable vs. module-specific capabilities.
3. [business-rules.md](business-rules.md) — calculations, validations, statuses, numbering. Contains the accepted-quantity golden rule referenced by `EXPORT ORDER CRITICAL RULE` in the root [`CLAUDE.md`](../../../CLAUDE.md).
4. [ui-spec.md](ui-spec.md) — screens, navigation, terminology, role permissions.
5. [api-spec.md](api-spec.md) — REST resource map.
6. [acceptance-tests.md](acceptance-tests.md) — Given/When/Then scenarios implementation must satisfy.

Each design doc carries its own "Open questions for Product Owner" section — resolve those before or during implementation of the area they cover, not silently.

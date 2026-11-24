import json
from pathlib import Path


def load_catalog(path: Path) -> list[dict]:
    catalog = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(catalog, list) or not catalog:
        raise ValueError("O catálogo deve conter uma lista de builds.")

    for index, build in enumerate(catalog, start=1):
        fields = ("champion", "role", "patch", "name", "note")
        if not isinstance(build, dict) or any(
            not isinstance(build.get(field), str) or not build[field].strip()
            for field in fields
        ):
            raise ValueError(f"Build {index} tem campos de texto ausentes ou vazios.")
        items = build.get("items")
        if not isinstance(items, list) or not items or any(
            not isinstance(item, str) or not item.strip() for item in items
        ):
            raise ValueError(f"Build {index} deve ter uma lista de itens.")

    return catalog


def format_recommendation(catalog: list[dict], champion: str, role: str, patch: str) -> str:
    matches = [
        build
        for build in catalog
        if build["champion"].strip().casefold() == champion.casefold()
        and build["role"].strip().casefold() == role.casefold()
        and build["patch"].strip().casefold() == patch.casefold()
    ]
    version = "referências gerais do catálogo" if patch.casefold() == "geral" else f"patch {patch}"
    heading = f"**{champion} · {role.upper()}** ({version})"
    if not matches:
        return f"{heading}\nNenhuma build cadastrada para essa combinação."

    lines = [heading]
    for build in matches:
        items = " → ".join(build["items"])
        lines.append(f"**{build['name']}** — {items}\n{build['note']}")
    return "\n\n".join(lines)

"""Testes do parser de runas e itens do OP.GG (T-004), com páginas reais salvas em fixtures/."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = Path(__file__).resolve().parent / "fixtures"
sys.path.insert(0, str(ROOT))

import opgg  # noqa: E402


def fixture(name):
    return (FIXTURES / name).read_text(encoding="utf-8")


def option(win, games, pick=0.1):
    return {"win_rate": win, "games": games, "pick_rate": pick}


class ParseRunesTest(unittest.TestCase):
    def check_rates(self, cells):
        for cell in cells:
            self.assertTrue(0 <= cell["pick_rate"] <= 1)
            self.assertTrue(0 <= cell["win_rate"] <= 1)
            self.assertIsInstance(cell["games"], int)
            self.assertGreaterEqual(cell["games"], 0)

    def test_zed_jungle(self):
        patch, games, runes = opgg.parse_runes(fixture("zed_jungle_runes.html"), "zed", "jungle")
        self.assertRegex(patch, r"^\d+\.\d+$")
        self.assertEqual(games, 45420)
        self.assertEqual(len(runes["pages"]), 5)
        # A 1ª página (mais escolhida) fica em 1º; a aberta é a de maior vitória entre as elegíveis.
        self.assertEqual(runes["pages"][0]["keystone"], 8369)
        self.assertEqual(runes["selected"], 1)
        selected = runes["pages"][1]
        self.assertEqual((selected["primary"], selected["secondary"]), (8300, 8000))
        self.assertEqual(selected["perks"], [8369, 8321, 8313, 8347, 8017, 9105, 5008, 5008, 5011])
        self.assertAlmostEqual(selected["pick_rate"], 0.101)
        self.assertAlmostEqual(selected["win_rate"], 0.4902)
        for page in runes["pages"]:
            self.assertEqual(len(page["perks"]), 9)
            self.assertIn(str(page["primary"]), runes["trees"])
            self.assertIn(str(page["secondary"]), runes["trees"])
            self.check_rates([page, page["variant"]])
        self.assertEqual(sorted(runes["trees"]), ["8000", "8100", "8200", "8300"])
        tree = runes["trees"]["8300"]
        self.assertEqual([cell["id"] for cell in tree["primary"][0]], [8351, 8360, 8369])
        keystone = tree["primary"][0][2]
        self.assertEqual(keystone["games"], 34277)
        self.assertAlmostEqual(keystone["pick_rate"], round(34277 / 45420, 4))
        self.assertAlmostEqual(keystone["win_rate"], 0.486, places=3)
        self.assertEqual(len(runes["shards"]), 3)
        self.assertEqual(sum(cell["games"] for cell in runes["shards"][0]), games)
        for rows in [runes["shards"], *(part for tree in runes["trees"].values() for part in tree.values())]:
            for row in rows:
                self.check_rates(row)

    def test_orianna_mid(self):
        patch, games, runes = opgg.parse_runes(fixture("orianna_mid_runes.html"), "orianna", "mid")
        self.assertRegex(patch, r"^\d+\.\d+$")
        self.assertEqual(games, 90612)
        page = runes["pages"][runes["selected"]]
        self.assertEqual((page["keystone"], page["primary"], page["secondary"]), (8214, 8200, 8400))
        self.assertFalse(page["variant"]["low_sample"])

    def test_wrong_role_is_rejected(self):
        with self.assertRaises(ValueError):
            opgg.parse_runes(fixture("zed_jungle_runes.html"), "zed", "mid")
        with self.assertRaises(ValueError):
            opgg.parse_items(fixture("orianna_mid_items.html"), "orianna", "jungle")

    def test_wrong_champion_or_page_is_rejected(self):
        with self.assertRaises(ValueError):
            opgg.parse_runes(fixture("zed_jungle_runes.html"), "orianna", "jungle")
        with self.assertRaises(ValueError):
            opgg.parse_runes(fixture("zed_jungle_items.html"), "zed", "jungle")

    def test_page_without_rsc_is_rejected(self):
        with self.assertRaises(ValueError):
            opgg.parse_runes("<html><body>vazio</body></html>", "zed", "jungle")

    def test_broken_structure_is_rejected(self):
        html = fixture("zed_jungle_runes.html").replace("rune_pages", "rune_pagez")
        with self.assertRaises(ValueError):
            opgg.parse_runes(html, "zed", "jungle")


class ParseItemsTest(unittest.TestCase):
    def test_zed_jungle(self):
        patch, sections = opgg.parse_items(fixture("zed_jungle_items.html"), "zed", "jungle")
        self.assertRegex(patch, r"^\d+\.\d+$")
        self.assertEqual(set(sections), {"core", "boots", "starting", "items"})
        build = {key: opgg.best(options) for key, options in sections.items()}
        self.assertEqual(build["core"]["ids"], [6699, 6696, 2520])
        self.assertEqual(build["core"]["games"], 1113)
        self.assertAlmostEqual(build["core"]["win_rate"], 0.5633)
        self.assertEqual(build["boots"]["ids"], [3008])
        self.assertEqual(build["starting"]["ids"], [1101])
        for options in sections.values():
            for entry in options:
                self.assertTrue(0 <= entry["pick_rate"] <= 1 and 0 <= entry["win_rate"] <= 1)
                self.assertIsInstance(entry["games"], int)

    def test_orianna_mid(self):
        patch, sections = opgg.parse_items(fixture("orianna_mid_items.html"), "orianna", "mid")
        build = {key: opgg.best(options) for key, options in sections.items()}
        self.assertEqual(build["core"]["ids"], [1082, 2503, 3152, 3157])
        self.assertEqual(build["starting"]["ids"], [1056, 2003, 2003])
        self.assertTrue(all(2 <= len(entry["ids"]) <= 6 for entry in sections["core"]))

    @staticmethod
    def synthetic(core, boots, items="", nav=""):
        params = ('"params":{"game_region":"global","game_tier":"emerald_plus",'
                  '"game_patch_version":"16.22","game_position":"jungle"}')
        starters = ('{"data":[{"ids":[1101,2003],"pick_rate":50,"play":"1,200","win_rate":50,'
                    '"metaStarterItems":[[{"name":"a"},1],[{"name":"b"},1]]}]}')
        text = (f'{nav}{params}"children":"Core builds"}}],{core}"children":"Boots"}}],{boots}'
                f'"children":"Starter items"}}],{starters}{items}')
        return ('<link rel="canonical" href="https://op.gg/lol/champions/zed/items/jungle"/>'
                f"<script>self.__next_f.push({json.dumps([1, text])})</script>")

    def test_section_without_data_does_not_borrow_the_next_one(self):
        core = '{"data":[{"ids":[6699,6696],"pick_rate":3,"play":"500","win_rate":55}]}'
        patch, sections = opgg.parse_items(self.synthetic(core, ""), "zed", "jungle")
        self.assertEqual(patch, "16.22")
        self.assertEqual(sections["boots"], [])
        self.assertIsNone(opgg.best(sections["boots"]))
        self.assertEqual(sections["starting"][0]["games"], 1200)
        self.assertEqual(sections["core"][0]["ids"], [6699, 6696])

    def test_empty_core_is_no_data(self):
        boots = '{"data":[{"ids":[3008],"pick_rate":5,"play":"300","win_rate":51}]}'
        with self.assertRaises(opgg.NoDataError):
            opgg.parse_items(self.synthetic("", boots), "zed", "jungle")

    def test_same_patch_on_both_pages(self):
        runes_patch = opgg.parse_runes(fixture("zed_jungle_runes.html"), "zed", "jungle")[0]
        items_patch = opgg.parse_items(fixture("zed_jungle_items.html"), "zed", "jungle")[0]
        self.assertEqual(runes_patch, items_patch)


    def test_orianna_other_items(self):
        _, sections = opgg.parse_items(fixture("orianna_mid_items.html"), "orianna", "mid")
        self.assertEqual(len(sections["items"]), 30)
        first = sections["items"][0]
        self.assertEqual(first["ids"], [4645])
        self.assertEqual(first["games"], 48106)
        self.assertAlmostEqual(first["pick_rate"], 0.532)
        for entry in sections["items"]:
            self.assertEqual(len(entry["ids"]), 1)
            self.assertTrue(0 <= entry["pick_rate"] <= 1 and 0 <= entry["win_rate"] <= 1)

    def test_other_items_missing_is_empty(self):
        core = '{"data":[{"ids":[6699,6696],"pick_rate":3,"play":"500","win_rate":55}]}'
        _, sections = opgg.parse_items(self.synthetic(core, ""), "zed", "jungle")
        self.assertEqual(sections["items"], [])

    def test_navigation_items_label_is_not_captured(self):
        # O rótulo "Items" da navegação vem antes de "Core builds" e não vira a lista de outros itens.
        nav = '"children":"Items"},{"data":[{"ids":[9999],"pick_rate":90,"play":"9,000","win_rate":60}]},'
        core = '{"data":[{"ids":[6699,6696],"pick_rate":3,"play":"500","win_rate":55}]}'
        _, sections = opgg.parse_items(self.synthetic(core, "", nav=nav), "zed", "jungle")
        self.assertEqual(sections["items"], [])
        self.assertEqual(sections["core"][0]["ids"], [6699, 6696])
        items = ('"children":"Items"}],{"data":[{"ids":[3026],"pick_rate":4,"play":2000,"win_rate":52},'
                 '{"ids":[3156],"pick_rate":2,"play":"1,500","win_rate":51}]}')
        _, sections = opgg.parse_items(self.synthetic(core, "", items=items, nav=nav), "zed", "jungle")
        self.assertEqual([entry["ids"] for entry in sections["items"]], [[3026], [3156]])
        self.assertEqual(sections["items"][0]["games"], 2000)
        # A lista de outros itens não vaza para os iniciais.
        self.assertEqual(len(sections["starting"]), 1)

    def test_malformed_other_items_are_ignored(self):
        core = '{"data":[{"ids":[6699,6696],"pick_rate":3,"play":"500","win_rate":55}]}'
        items = '"children":"Items"}],{"data":[{"ids":[3026,3156],"pick_rate":4,"play":2000,"win_rate":52}]}'
        _, sections = opgg.parse_items(self.synthetic(core, "", items=items), "zed", "jungle")
        self.assertEqual(sections["items"], [])


def item(item_id, win, games, pick=0.05):
    return {"ids": [item_id], "win_rate": win, "games": games, "pick_rate": pick}


class OptionsTest(unittest.TestCase):
    @staticmethod
    def sections(name, champion, role):
        _, sections = opgg.parse_items(fixture(name), champion, role)
        return sections, {key: opgg.best(sections[key]) for key in ("core", "boots", "starting")}

    def test_situational_orianna(self):
        sections, build = self.sections("orianna_mid_items.html", "orianna", "mid")
        result = opgg.situational_items(sections["items"], build["core"], sections["boots"],
                                        sections["starting"], frozenset({1082, 3070, 3916, 2420}))
        self.assertEqual([entry["ids"][0] for entry in result], [3041, 3102, 3089, 4646, 3137, 4629])
        self.assertTrue(all(not entry["low_sample"] for entry in result))

    def test_situational_zed(self):
        sections, build = self.sections("zed_jungle_items.html", "zed", "jungle")
        result = opgg.situational_items(sections["items"], build["core"], sections["boots"],
                                        sections["starting"], frozenset({3134, 1038, 3123}))
        self.assertEqual([entry["ids"][0] for entry in result], [3026, 2517, 6333, 6676, 3814, 3156])

    def test_situational_excludes_core_boots_starting_and_components(self):
        sections, build = self.sections("orianna_mid_items.html", "orianna", "mid")
        components = frozenset({1082, 3070, 3916, 2420})
        result = opgg.situational_items(sections["items"], build["core"], sections["boots"],
                                        sections["starting"], components, limit=30)
        ids = {entry["ids"][0] for entry in result}
        excluded = set(build["core"]["ids"]) | components
        excluded |= {i for option in sections["boots"] + sections["starting"] for i in option["ids"]}
        self.assertTrue(ids)
        self.assertFalse(ids & excluded)
        win_rates = [entry["win_rate"] for entry in result]
        self.assertEqual(win_rates, sorted(win_rates, reverse=True))

    def test_situational_limit_and_low_sample(self):
        items = [item(1, 0.6, 50), item(2, 0.7, 80), item(3, 0.5, 90), item(4, 0.9, 5000, pick=0.001)]
        result = opgg.situational_items(items, None, [], [], limit=2)
        self.assertEqual([entry["ids"][0] for entry in result], [4, 3])
        self.assertTrue(all(entry["low_sample"] for entry in result))
        items.append(item(5, 0.55, 300))
        result = opgg.situational_items(items, None, [], [], limit=6)
        self.assertEqual([entry["ids"][0] for entry in result], [5])
        self.assertFalse(result[0]["low_sample"])

    def test_ranked_does_not_mutate(self):
        items = [item(1, 0.6, 500)]
        result = opgg.ranked(items, 6)
        result[0]["ids"].append(2)
        self.assertNotIn("low_sample", items[0])
        self.assertEqual(items[0]["ids"], [1])

    def test_boot_options(self):
        cases = [("orianna_mid_items.html", "orianna", "mid", [3009, 3020, 3158, 3047]),
                 ("zed_jungle_items.html", "zed", "jungle", [3008, 3111, 3158, 3047])]
        for name, champion, role, expected in cases:
            sections, build = self.sections(name, champion, role)
            result = opgg.boot_options(sections["boots"], build["boots"])
            self.assertEqual([entry["ids"][0] for entry in result], expected)
            self.assertEqual(result[0], build["boots"])
            self.assertIsNot(result[0], build["boots"])

    def test_boot_options_empty(self):
        self.assertEqual(opgg.boot_options([], None), [])


class BestTest(unittest.TestCase):
    def test_highest_win_rate_among_eligible(self):
        options = [option(0.50, 5000), option(0.60, 100), option(0.70, 99), option(0.80, 5000, pick=0.009)]
        chosen = opgg.best(options)
        self.assertEqual(chosen["win_rate"], 0.60)
        self.assertFalse(chosen["low_sample"])

    def test_tie_goes_to_more_games(self):
        chosen = opgg.best([option(0.55, 200), option(0.55, 900), option(0.55, 300)])
        self.assertEqual(chosen["games"], 900)

    def test_fallback_to_most_games(self):
        chosen = opgg.best([option(0.90, 50), option(0.40, 80, pick=0.5), option(0.70, 500, pick=0.001)])
        self.assertEqual(chosen["games"], 500)
        self.assertTrue(chosen["low_sample"])

    def test_empty(self):
        self.assertIsNone(opgg.best([]))

    def test_does_not_mutate_options(self):
        options = [option(0.5, 1000)]
        opgg.best(options)
        self.assertNotIn("low_sample", options[0])


class ChampionBuildTest(unittest.TestCase):
    def test_contract_with_fixtures(self):
        pages = {"runes": fixture("zed_jungle_runes.html"), "items": fixture("zed_jungle_items.html")}
        original = opgg.download
        opgg.fetch_build.cache_clear()
        opgg.fetch_extras.cache_clear()
        opgg.download = lambda url: pages["runes" if "/runes/" in url else "items"]
        try:
            data = opgg.champion_build("zed", "jungle", "aatrox")
        finally:
            opgg.download = original
            opgg.fetch_build.cache_clear()
            opgg.fetch_extras.cache_clear()
        self.assertEqual((data["champion"], data["role"], data["target"]), ("zed", "jungle", "aatrox"))
        self.assertEqual((data["queue"], data["source"]), ("ranked", "OP.GG"))
        self.assertEqual(data["games"], 45420)
        self.assertTrue(data["url"].startswith("https://op.gg/pt/lol/champions/zed/build/jungle?"))
        self.assertIn(f"patch={data['patch']}", data["url"])
        self.assertIn("target_champion=aatrox", data["url"])
        self.assertEqual(set(data["build"]), {"core", "boots", "starting"})
        self.assertEqual(set(data["build"]["core"]), {"ids", "games", "pick_rate", "win_rate", "low_sample"})
        self.assertEqual(set(data["options"]), {"boots", "starting", "core", "situational"})
        self.assertNotIn("extras", data)
        self.assertEqual([entry["ids"][0] for entry in data["options"]["boots"]], [3008, 3111, 3158, 3047])
        for entry in data["options"]["boots"] + data["options"]["situational"]:
            self.assertEqual(set(entry), {"ids", "games", "pick_rate", "win_rate", "low_sample"})

    def test_options_use_components_and_keep_cache_intact(self):
        pages = {"runes": fixture("zed_jungle_runes.html"), "items": fixture("zed_jungle_items.html")}
        original = opgg.download
        opgg.fetch_build.cache_clear()
        opgg.fetch_extras.cache_clear()
        opgg.download = lambda url: pages["runes" if "/runes/" in url else "items"]
        try:
            components = frozenset({3134, 1038, 3123})
            first = opgg.champion_build("zed", "jungle", None, components)
            first["options"]["boots"][0]["ids"].append(1)
            first["options"]["situational"].clear()
            second = opgg.champion_build("zed", "jungle", None, components)
            plain = opgg.champion_build("zed", "jungle")
        finally:
            opgg.download = original
            opgg.fetch_build.cache_clear()
            opgg.fetch_extras.cache_clear()
        self.assertEqual([entry["ids"][0] for entry in second["options"]["situational"]],
                         [3026, 2517, 6333, 6676, 3814, 3156])
        self.assertEqual(second["options"]["boots"][0]["ids"], [3008])
        self.assertEqual(second["build"]["boots"]["ids"], [3008])
        self.assertEqual(len(plain["options"]["situational"]), 6)
        self.assertIn(1038, [entry["ids"][0] for entry in plain["options"]["situational"]])

    def test_invalid_role(self):
        with self.assertRaises(ValueError):
            opgg.champion_build("zed", "middle")


if __name__ == "__main__":
    unittest.main()

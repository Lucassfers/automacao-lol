"""Testes dos extras da página /build do OP.GG (T-011), com páginas reais salvas em fixtures/."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = Path(__file__).resolve().parent / "fixtures"
sys.path.insert(0, str(ROOT))

import opgg  # noqa: E402

BLOCKS = {"spells", "skills", "depth", "jungle"}


def fixture(name):
    return (FIXTURES / name).read_text(encoding="utf-8")


def payload(name):
    text = opgg.rsc_text(fixture(name))
    return text, opgg.rsc_rows(text)


LEESIN = "leesin_jungle_build.html"
AHRI = "ahri_mid_build.html"


class ResolverTest(unittest.TestCase):
    TEXT = ('1:["$","div",null,{"children":"$L2"}]\n'
            '2:["$","span",null,{"children":"oi"}]\n'
            '3:["$","b",null,{"children":"$L4"}]\n'
            '4:["$","i",null,{"children":"$L3"}]\n'
            '62:I[123,[],""]\n'
            '5:{"a":"$L62","b":"$L99","c":"$La3"}\n')

    def test_rows_skip_module_lines(self):
        rows = opgg.rsc_rows(self.TEXT)
        self.assertEqual(set(rows), {"1", "2", "3", "4", "5"})

    def test_reference_is_resolved(self):
        rows = opgg.rsc_rows(self.TEXT)
        node = opgg.resolve(self.TEXT, rows, "$L1")
        self.assertEqual(node, ["$", "div", None, {"children": ["$", "span", None, {"children": "oi"}]}])
        self.assertEqual(opgg.jsx_walk(node), [("span", "oi")])

    def test_cycle_does_not_hang(self):
        rows = opgg.rsc_rows(self.TEXT)
        node = opgg.resolve(self.TEXT, rows, "$L3")
        # 3 → 4 → 3 (ciclo): a segunda visita fica como string.
        self.assertEqual(node[3]["children"][3]["children"], "$L3")

    def test_unknown_and_module_ids_stay_strings(self):
        rows = opgg.rsc_rows(self.TEXT)
        node = opgg.resolve(self.TEXT, rows, "$L5")
        self.assertEqual(node, {"a": "$L62", "b": "$L99", "c": "$La3"})

    def test_input_is_not_mutated(self):
        rows = opgg.rsc_rows(self.TEXT)
        node = ["$", "div", None, {"children": "$L2"}]
        opgg.resolve(self.TEXT, rows, node)
        self.assertEqual(node[3]["children"], "$L2")

    def test_long_reference_chain_is_bounded(self):
        lines = [f'{i:x}:["$","div",null,{{"children":"$L{i + 1:x}"}}]' for i in range(1, 200)]
        text = "\n".join(lines) + '\nc8:["$","span",null,{"children":"fim"}]\n'
        node = opgg.resolve(text, opgg.rsc_rows(text), "$L1")
        depth = 0
        while isinstance(node, list):
            node = node[3]["children"]
            depth += 1
        self.assertTrue(isinstance(node, str) and node.startswith("$L"))
        self.assertEqual(depth, opgg.MAX_REF_DEPTH)


class FormatsTest(unittest.TestCase):
    def test_percent(self):
        self.assertEqual(opgg.parse_percent("61.24%"), 0.6124)
        self.assertEqual(opgg.parse_percent("100%"), 1.0)
        for value in ("120%", "61,24%", "abc", "", None, 61.24, "-1%"):
            with self.assertRaises(ValueError):
                opgg.parse_percent(value)

    def test_games(self):
        self.assertEqual(opgg.parse_games("12,991 games"), 12991)
        self.assertEqual(opgg.parse_games("1 game"), 1)
        self.assertEqual(opgg.parse_games("16 games"), 16)
        for value in ("12.991 games", "games", "1,2 games", None, 12):
            with self.assertRaises(ValueError):
                opgg.parse_games(value)


class ParseBlocksTest(unittest.TestCase):
    def test_spells(self):
        text, rows = payload(LEESIN)
        spells = opgg.parse_spells(text, rows)
        self.assertEqual(spells[0], {"ids": [4, 11], "games": 128140, "pick_rate": 0.9997,
                                     "win_rate": 0.4846, "low_sample": False})
        self.assertEqual((spells[1]["ids"], spells[1]["games"], spells[1]["low_sample"]), ([6, 11], 16, True))

    def test_skills(self):
        text, rows = payload(LEESIN)
        skills = opgg.parse_skills(text, rows, "leesin")
        self.assertEqual(skills["priority"], ["Q", "W", "E"])
        self.assertEqual(len(skills["order"]), 15)
        self.assertEqual([i for i, key in enumerate(skills["order"]) if key == "R"], [5, 10])
        self.assertEqual(skills["icons"], {"Q": "LeeSinQOne.png", "W": "LeeSinWOne.png", "E": "LeeSinEOne.png"})
        self.assertEqual(skills["games"], 38674)
        self.assertTrue(0 <= skills["pick_rate"] <= 1 and 0 <= skills["win_rate"] <= 1)
        self.assertFalse(skills["low_sample"])

    def test_skills_of_other_champion_are_rejected(self):
        text, rows = payload(LEESIN)
        with self.assertRaises(ValueError):
            opgg.parse_skills(text, rows, "ahri")

    def test_skills_ahri(self):
        text, rows = payload(AHRI)
        skills = opgg.parse_skills(text, rows, "ahri")
        self.assertEqual(len(skills["order"]), 15)
        self.assertEqual(set(skills["priority"]), {"Q", "W", "E"})

    def test_depth(self):
        text, rows = payload(LEESIN)
        depth = opgg.parse_depth(text, rows)
        self.assertEqual(set(depth), {"4", "5", "6"})
        self.assertEqual(depth["4"][0], {"id": 3026, "games": 12991, "win_rate": 0.6124, "low_sample": False})
        # depth_5 usa referências "$La3"... e só fica completo com o resolvedor.
        self.assertEqual(len(depth["5"]), 5)
        self.assertEqual([entry["id"] for entry in depth["5"]], [3026, 3156, 6333, 3053, 3814])
        self.assertTrue(all(entry["low_sample"] for entry in depth["6"]))
        for entries in depth.values():
            self.assertTrue(1 <= len(entries) <= 5)

    def test_jungle(self):
        text, _ = payload(LEESIN)
        jungle = opgg.parse_jungle(text)
        self.assertEqual(list(jungle), ["blue", "red"])
        self.assertEqual(jungle["red"], {"route": ["RAPTORS", "RED", "KRUG", "WOLVES", "BLUE", "GROMP"],
                                         "games": 77757, "total": 221272})
        self.assertEqual(jungle["blue"]["games"], 77459)

    def test_jungle_missing_is_none(self):
        text, _ = payload(AHRI)
        self.assertIsNone(opgg.parse_jungle(text))

    def test_jungle_unknown_camp_is_rejected(self):
        text = opgg.rsc_text(fixture(LEESIN).replace("GROMP", "HACK"))
        with self.assertRaises(ValueError):
            opgg.parse_jungle(text)


class BuildExtrasTest(unittest.TestCase):
    def test_leesin_all_blocks(self):
        patch, extras = opgg.parse_build_extras(fixture(LEESIN), "leesin", "jungle")
        self.assertEqual(patch, "16.23")
        self.assertEqual(set(extras), BLOCKS)
        self.assertTrue(all(extras[key] is not None for key in BLOCKS))

    def test_ahri_mid_has_no_jungle(self):
        patch, extras = opgg.parse_build_extras(fixture(AHRI), "ahri", "mid")
        self.assertEqual(patch, "16.23")
        self.assertIsNone(extras["jungle"])
        self.assertEqual(extras["spells"][0]["ids"], [4, 14])
        self.assertIsNotNone(extras["skills"])
        self.assertIsNotNone(extras["depth"])

    def test_broken_block_is_isolated(self):
        cases = {
            "spells": ("spells_table_0", "spells_table_9"),
            "depth": ("61.24%", "120.24%"),
            "jungle": ("GROMP", "HACK"),
            "skills": ("SkillOrder Table", "SkillOrder Tablet"),
        }
        for broken, (old, new) in cases.items():
            with self.subTest(broken=broken), self.assertLogs(level="WARNING"):
                _, extras = opgg.parse_build_extras(fixture(LEESIN).replace(old, new), "leesin", "jungle")
                self.assertIsNone(extras[broken])
                self.assertTrue(all(extras[key] is not None for key in BLOCKS - {broken}))

    def test_wrong_page_is_rejected(self):
        with self.assertRaises(ValueError):
            opgg.parse_build_extras(fixture(LEESIN), "ahri", "jungle")
        with self.assertRaises(ValueError):
            opgg.parse_build_extras(fixture(LEESIN), "leesin", "top")
        with self.assertRaises(ValueError):
            opgg.parse_build_extras(fixture("leesin_jungle_items.html"), "leesin", "jungle")


class ContractTest(unittest.TestCase):
    def setUp(self):
        self.pages = {"runes": fixture("leesin_jungle_runes.html"), "items": fixture("leesin_jungle_items.html"),
                      "build": fixture(LEESIN)}
        self.urls = []
        self.original = opgg.download
        opgg.fetch_build.cache_clear()
        opgg.fetch_extras.cache_clear()

        def download(url):
            self.urls.append(url)
            for kind in ("runes", "items", "build"):
                if f"/{kind}/" in url:
                    page = self.pages[kind]
                    if isinstance(page, Exception):
                        raise page
                    return page
            raise AssertionError(url)

        opgg.download = download

    def tearDown(self):
        opgg.download = self.original
        opgg.fetch_build.cache_clear()
        opgg.fetch_extras.cache_clear()

    def test_general_build_has_extras(self):
        data = opgg.champion_build("leesin", "jungle")
        self.assertEqual(sum("/build/" in url for url in self.urls), 1)
        self.assertEqual(set(data["extras"]), BLOCKS)
        self.assertEqual(data["extras"]["spells"][0]["ids"], [4, 11])
        self.assertEqual(data["extras"]["jungle"]["blue"]["games"], 77459)
        self.assertEqual(set(data["options"]), {"boots", "starting", "core", "situational"})
        self.assertEqual([entry["ids"] for entry in data["options"]["starting"]], [[1102], [1101]])
        self.assertEqual(data["options"]["starting"][0]["ids"], data["build"]["starting"]["ids"])
        self.assertEqual(len(data["options"]["core"]), 5)
        self.assertEqual(data["options"]["core"][0]["ids"], data["build"]["core"]["ids"])
        for entry in data["options"]["starting"] + data["options"]["core"]:
            self.assertEqual(set(entry), {"ids", "games", "pick_rate", "win_rate", "low_sample"})
        json.dumps(data)

    def test_matchup_does_not_download_build_page(self):
        data = opgg.champion_build("leesin", "jungle", "ahri")
        self.assertNotIn("extras", data)
        self.assertFalse(any("/build/" in url for url in self.urls))

    def test_cache_is_not_mutated(self):
        first = opgg.champion_build("leesin", "jungle")
        first["extras"]["spells"][0]["ids"].append(1)
        first["extras"]["depth"]["4"].clear()
        first["extras"]["jungle"]["blue"]["route"].pop()
        second = opgg.champion_build("leesin", "jungle")
        self.assertEqual(sum("/build/" in url for url in self.urls), 1)
        self.assertEqual(second["extras"]["spells"][0]["ids"], [4, 11])
        self.assertEqual(len(second["extras"]["depth"]["4"]), 5)
        self.assertEqual(len(second["extras"]["jungle"]["blue"]["route"]), 6)

    def test_build_page_failure_keeps_build(self):
        self.pages["build"] = OSError("sem rede")
        with self.assertLogs(level="WARNING"):
            data = opgg.champion_build("leesin", "jungle")
        self.assertEqual(data["extras"], dict.fromkeys(BLOCKS))
        self.assertIsNotNone(data["build"]["core"])
        # A falha também fica em cache (sem nova requisição na mesma janela).
        opgg.champion_build("leesin", "jungle")
        self.assertEqual(sum("/build/" in url for url in self.urls), 1)

    def test_wrong_build_page_gives_empty_blocks(self):
        self.pages["build"] = fixture(AHRI)
        with self.assertLogs(level="WARNING"):
            data = opgg.champion_build("leesin", "jungle")
        self.assertEqual(data["extras"], dict.fromkeys(BLOCKS))

    def test_different_patch_gives_empty_blocks(self):
        self.pages["build"] = fixture(LEESIN).replace('game_patch_version\\":\\"16.23', 'game_patch_version\\":\\"16.22')
        opgg.fetch_extras.cache_clear()
        self.assertEqual(opgg.fetch_extras("leesin", "jungle", 0)[0], "16.22")
        data = opgg.champion_build("leesin", "jungle")
        self.assertEqual(data["patch"], "16.23")
        self.assertEqual(data["extras"], dict.fromkeys(BLOCKS))


if __name__ == "__main__":
    unittest.main()

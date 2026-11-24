"""Testes das rotas por campeão do OP.GG (T-006) e das taxas de cada rota (T-010), com a lista de campeões real salva em fixtures/."""
import json
import sys
import unittest
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from unittest import mock
from urllib.error import HTTPError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = Path(__file__).resolve().parent / "fixtures"
sys.path.insert(0, str(ROOT))

import dashboard  # noqa: E402
import opgg  # noqa: E402

LANES = set(opgg.POSITION_KEYS.values())


def fixture():
    return (FIXTURES / "champions_list.html").read_text(encoding="utf-8")


class ParsePositionsTest(unittest.TestCase):
    def test_fixture(self):
        patch, positions, _ = opgg.parse_positions(fixture())
        self.assertRegex(patch, r"^\d+\.\d+$")
        self.assertEqual(len(positions), 173)
        self.assertEqual(positions["aatrox"], ["top", "jungle"])
        self.assertEqual(positions["ahri"], ["mid"])
        for key, roles in positions.items():
            self.assertRegex(key, r"^[a-z0-9]+$")
            self.assertTrue(set(roles) <= LANES)
            self.assertEqual(len(roles), len(set(roles)))

    def test_keys_match_local_catalog(self):
        catalog = json.loads((ROOT / "data" / "champions.json").read_text(encoding="utf-8"))
        ids = {row["id"].lower() for row in catalog["data"].values()}
        _, positions, _ = opgg.parse_positions(fixture())
        self.assertEqual(set(positions), ids)

    def test_wrong_canonical_is_rejected(self):
        html = fixture().replace('<link rel="canonical" href="https://op.gg/lol/champions"',
                                 '<link rel="canonical" href="https://op.gg/lol/champions/ahri/build"')
        with self.assertRaises(ValueError):
            opgg.parse_positions(html)

    def test_page_without_rsc_is_rejected(self):
        html = fixture().replace("self.__next_f.push", "self.other.push")
        with self.assertRaises(ValueError):
            opgg.parse_positions(html)

    def test_wrong_scope_is_rejected(self):
        html = fixture().replace('\\"tier\\":\\"emerald_plus\\",\\"position\\":\\"all\\"',
                                 '\\"tier\\":\\"gold\\",\\"position\\":\\"all\\"')
        self.assertNotEqual(html, fixture())
        with self.assertRaises(ValueError):
            opgg.parse_positions(html)

    def test_positions_not_a_list_is_rejected(self):
        html = fixture().replace('\\"positions\\":[\\"TOP\\",\\"JUNGLE\\"]', '\\"positions\\":\\"TOP\\"', 1)
        self.assertNotEqual(html, fixture())
        with self.assertRaises(ValueError):
            opgg.parse_positions(html)

    def test_unknown_role_is_rejected(self):
        html = fixture().replace('\\"positions\\":[\\"TOP\\",\\"JUNGLE\\"]', '\\"positions\\":[\\"BOT\\"]', 1)
        self.assertNotEqual(html, fixture())
        with self.assertRaises(ValueError):
            opgg.parse_positions(html)

    def test_too_few_champions_is_rejected(self):
        patch, positions, _ = opgg.parse_positions(fixture())
        rows = [{"key": key, "positions": [role.upper() for role in roles]} for key, roles in list(positions.items())[:10]]
        text = ('"params":{"type":"ranked","region":"global","tier":"emerald_plus","position":"all","version":"%s"}'
                ' "type":"ranked","data":%s' % (patch, json.dumps(rows)))
        html = ('<link rel="canonical" href="https://op.gg/lol/champions">'
                f"<script>self.__next_f.push({json.dumps([1, text])})</script>")
        with self.assertRaises(ValueError):
            opgg.parse_positions(html)


class RoleRatesTest(unittest.TestCase):
    def test_fixture_rates(self):
        _, positions, rates = opgg.parse_positions(fixture())
        self.assertEqual(len(rates), 173)
        yasuo = rates["yasuo"]
        self.assertEqual(list(yasuo), ["mid", "top", "adc"])
        self.assertAlmostEqual(yasuo["mid"], 0.6027, places=4)
        self.assertAlmostEqual(yasuo["top"], 0.2441, places=4)
        self.assertAlmostEqual(yasuo["adc"], 0.1478, places=4)
        self.assertEqual(list(rates["ahri"]), ["mid"])
        self.assertAlmostEqual(rates["ahri"]["mid"], 0.96, places=2)
        for key, lanes in rates.items():
            self.assertEqual(set(lanes), set(positions[key]))
            for value in lanes.values():
                self.assertTrue(0 <= value <= 1)
            ordered = sorted(lanes, key=lanes.get, reverse=True)
            self.assertEqual(ordered, positions[key])

    def test_without_role_rates_positions_still_work(self):
        html = fixture().replace("positionRoleRate", "positionOtherRate")
        self.assertNotEqual(html, fixture())
        with self.assertLogs(level="WARNING"):
            patch, positions, rates = opgg.parse_positions(html)
        self.assertEqual(len(positions), 173)
        self.assertEqual(rates, {})

    def test_without_role_rate_block_positions_still_work(self):
        html = fixture().replace("positionName", "positionLabel")
        with self.assertLogs(level="WARNING"):
            _, positions, rates = opgg.parse_positions(html)
        self.assertEqual(len(positions), 173)
        self.assertEqual(rates, {})

    def test_invalid_value_is_ignored(self):
        _, _, original = opgg.parse_positions(fixture())
        for bad in ('\\"x\\"', "1.5", "true"):
            with self.subTest(bad=bad):
                html = fixture().replace('\\"positionRoleRate\\":0.520607', f'\\"positionRoleRate\\":{bad}', 1)
                self.assertNotEqual(html, fixture())
                with self.assertLogs(level="WARNING"):
                    _, positions, rates = opgg.parse_positions(html)
                self.assertEqual(len(positions), 173)
                self.assertNotIn("mid", rates.get("ekko", {}))
                self.assertEqual(rates["yasuo"], original["yasuo"])

    def test_local_copy_rates_match_positions(self):
        local = json.loads((ROOT / "data" / "roles.json").read_text(encoding="utf-8"))
        self.assertTrue(local["rates"])
        self.assertTrue(set(local["rates"]) <= set(local["positions"]))
        for key, lanes in local["rates"].items():
            self.assertTrue(set(lanes) <= set(local["positions"][key]))
            self.assertTrue(all(0 <= value <= 1 for value in lanes.values()))


class Monitor:
    def snapshot(self):
        return {"status": "waiting"}


class PositionsEndpointTest(unittest.TestCase):
    def setUp(self):
        handler = partial(dashboard.DashboardHandler, draft_client=Monitor(), champion_ids={"ahri", "aatrox"})
        dashboard.DashboardHandler.log_message = lambda *args: None
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.server.server_port}/api/opgg/positions"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def get(self):
        try:
            with urlopen(self.url, timeout=5) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    def test_live_data_filtered_by_catalog(self):
        data = {"source": "OP.GG", "patch": "16.23", "stale": False,
                "positions": {"ahri": ["mid"], "aatrox": ["top", "jungle"], "intruso": ["top"]}}
        with mock.patch.object(dashboard, "champion_positions", return_value=data):
            status, body = self.get()
        self.assertEqual(status, 200)
        self.assertFalse(body["stale"])
        self.assertEqual(body["positions"], {"ahri": ["mid"], "aatrox": ["top", "jungle"]})
        self.assertEqual(body["rates"], {})

    def test_live_rates_filtered_by_catalog(self):
        data = {"source": "OP.GG", "patch": "16.23", "stale": False,
                "positions": {"ahri": ["mid"], "aatrox": ["top", "jungle"], "intruso": ["top"]},
                "rates": {"ahri": {"mid": 0.96}, "aatrox": {"top": 0.8, "jungle": 0.2}, "intruso": {"top": 1.0}}}
        with mock.patch.object(dashboard, "champion_positions", return_value=data):
            status, body = self.get()
        self.assertEqual(status, 200)
        self.assertEqual(body["rates"], {"ahri": {"mid": 0.96}, "aatrox": {"top": 0.8, "jungle": 0.2}})

    def test_fallback_to_local_copy(self):
        with mock.patch.object(dashboard, "champion_positions", side_effect=OSError("rede")), \
                self.assertLogs(level="WARNING"):
            status, body = self.get()
        self.assertEqual(status, 200)
        self.assertTrue(body["stale"])
        self.assertEqual(body["source"], "local")
        self.assertEqual(body["positions"]["aatrox"], ["top", "jungle"])
        self.assertEqual(set(body["positions"]), {"ahri", "aatrox"})
        self.assertEqual(set(body["rates"]), {"ahri", "aatrox"})
        self.assertEqual(list(body["rates"]["aatrox"]), ["top", "jungle"])

    def test_fallback_without_local_rates(self):
        local = ROOT / "tests" / "_roles_sem_taxas.json"
        local.write_text(json.dumps({"source": "local", "patch": "16.23", "positions": {"ahri": ["mid"]}}),
                         encoding="utf-8")
        self.addCleanup(local.unlink)
        with mock.patch.object(dashboard, "champion_positions", side_effect=OSError("rede")),                 mock.patch.object(dashboard, "LOCAL_POSITIONS", local), self.assertLogs(level="WARNING"):
            status, body = self.get()
        self.assertEqual(status, 200)
        self.assertEqual(body["positions"], {"ahri": ["mid"]})
        self.assertEqual(body["rates"], {})

    def test_without_local_copy_returns_502(self):
        with mock.patch.object(dashboard, "champion_positions", side_effect=ValueError("estrutura")), \
                mock.patch.object(dashboard, "LOCAL_POSITIONS", ROOT / "data" / "inexistente.json"), \
                self.assertLogs(level="WARNING"):
            status, body = self.get()
        self.assertEqual(status, 502)
        self.assertEqual(body, {"error": "OP.GG indisponível no momento."})


if __name__ == "__main__":
    unittest.main()

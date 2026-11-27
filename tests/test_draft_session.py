"""Testes do snapshot da seleção de campeões (T-016): identificador da sessão para amarrar o inimigo manual."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import draft  # noqa: E402

CHAMPIONS = {91: {"id": "Talon", "name": "Talon"}, 121: {"id": "Khazix", "name": "Kha'Zix"}}


def session(**extra):
    return {
        "localPlayerCellId": 0,
        "myTeam": [{"cellId": 0, "championId": 91, "assignedPosition": "jungle"}],
        "theirTeam": [{"cellId": 6, "assignedPosition": ""}],
        "actions": [[
            {"type": "pick", "actorCellId": 0, "championId": 91, "completed": False},
            {"type": "pick", "actorCellId": 6, "championId": 121, "completed": True},
        ]],
        **extra,
    }


class DraftSessionTest(unittest.TestCase):
    def test_snapshot_keeps_fields_and_adds_session(self):
        snapshot = draft.draft_snapshot(session(gameId=123456), CHAMPIONS)
        self.assertEqual(snapshot["champion"], CHAMPIONS[91])
        self.assertFalse(snapshot["confirmed"])
        self.assertEqual(snapshot["role"], "jungle")
        self.assertEqual([row["id"] for row in snapshot["enemies"]], ["Khazix"])
        self.assertIsNone(snapshot["enemies"][0]["role"])
        self.assertRegex(snapshot["session"], r"^[0-9a-f]{16}$")

    def test_session_stable_across_confirmation(self):
        before = draft.draft_snapshot(session(gameId=123456), CHAMPIONS)
        confirmed = session(gameId=123456)
        confirmed["actions"][0][0]["completed"] = True
        after = draft.draft_snapshot(confirmed, CHAMPIONS)
        self.assertTrue(after["confirmed"])
        self.assertEqual(before["session"], after["session"])

    def test_new_draft_same_champion_and_role_changes_session(self):
        first = draft.draft_snapshot(session(gameId=111), CHAMPIONS)
        second = draft.draft_snapshot(session(gameId=222), CHAMPIONS)
        self.assertEqual((first["champion"], first["role"]), (second["champion"], second["role"]))
        self.assertNotEqual(first["session"], second["session"])

    def test_session_key_fallbacks(self):
        chat = {"chatDetails": {"multiUserChatId": "sala-1"}, "gameId": 0}
        self.assertEqual(draft.session_key(chat), draft.session_key({"chatDetails": {"multiUserChatId": "sala-1"}}))
        self.assertNotEqual(draft.session_key({"id": "abc"}), draft.session_key({"id": "abd"}))
        self.assertIsNone(draft.session_key({"gameId": 0, "chatDetails": {}}))
        self.assertIsNone(draft.session_key({}))
        self.assertIsNone(draft.draft_snapshot(session(), CHAMPIONS)["session"])

    def test_waiting_without_local_player(self):
        self.assertEqual(draft.draft_snapshot({"myTeam": []}, CHAMPIONS), {"status": "waiting"})


if __name__ == "__main__":
    unittest.main()

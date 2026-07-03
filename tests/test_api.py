"""API tests that run without Ollama or PostgreSQL by mocking the index
and provider.
"""
import json

from fastapi.testclient import TestClient

import app.main as m


class FakeIndex:
    def is_ready(self):
        return True

    def search(self, question):
        # Pretend retrieval pulled four chunks spanning pages 2-5.
        return [{"page": p, "text": f"content {p}"} for p in (2, 3, 4, 5)]


class FakeProvider:
    ANSWER = "Employees get 25 days of paid vacation per calendar year (page 3)."

    def generate(self, system, user):
        return self.ANSWER

    def generate_stream(self, system, user):
        for tok in ["Employees get ", "25 days\n", "of vacation ", "(page 3)."]:
            yield tok

m.index = FakeIndex()
m.provider = FakeProvider()

client = TestClient(m.app)


def test_cited_pages_parser():
    assert m.cited_pages("see (page 3) here") == [3]
    assert m.cited_pages("page 2 and page 5") == [2, 5]
    assert m.cited_pages("I do not know.") == []


def test_query_separates_cited_from_retrieved():
    res = client.post("/query", json={"question": "vacation?"})
    assert res.status_code == 200
    body = res.json()
    assert body["cited_pages"] == [3]
    assert body["retrieved_pages"] == [2, 3, 4, 5]


def test_query_stream_reassembles_and_cites():
    tokens, final = [], None
    with client.stream("POST", "/query/stream", json={"question": "vacation?"}) as s:
        assert s.status_code == 200
        for line in s.iter_lines():
            if not line or not line.startswith("data: "):
                continue
            payload = json.loads(line[len("data: "):])
            if payload.get("done"):
                final = payload
            elif payload.get("token"):
                tokens.append(payload["token"])
    assert "".join(tokens) == "Employees get 25 days\nof vacation (page 3)."
    assert final["cited_pages"] == [3]
    assert final["retrieved_pages"] == [2, 3, 4, 5]
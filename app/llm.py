"""Pluggable LLM provider layer.

"""
from abc import ABC, abstractmethod
from collections.abc import Iterator

import numpy as np
import ollama

from app import config


class LLMProvider(ABC):
    """The interface every provider must implement."""

    @abstractmethod
    def embed(self, text: str) -> np.ndarray:
        """Return a normalised embedding vector for a piece of text."""

    @abstractmethod
    def generate(self, system: str, user: str) -> str:
        """Return the full answer given a system and user message."""

    @abstractmethod
    def generate_stream(self, system: str, user: str) -> Iterator[str]:
        """Yield the answer token by token as it is produced."""


class OllamaProvider(LLMProvider):
    """Talks to a local Ollama server on localhost:11434."""

    def __init__(self, embed_model: str, gen_model: str):
        self.embed_model = embed_model
        self.gen_model = gen_model

    def embed(self, text: str) -> np.ndarray:
        resp = ollama.embeddings(model=self.embed_model, prompt=text)
        vec = np.array(resp["embedding"], dtype=np.float32)
        return vec / np.linalg.norm(vec)

    def _messages(self, system: str, user: str):
        return [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]

    def generate(self, system: str, user: str) -> str:
        resp = ollama.chat(model=self.gen_model, messages=self._messages(system, user))
        return resp["message"]["content"]

    def generate_stream(self, system: str, user: str) -> Iterator[str]:
        stream = ollama.chat(
            model=self.gen_model,
            messages=self._messages(system, user),
            stream=True,
        )
        for chunk in stream:
            token = chunk["message"]["content"]
            if token:
                yield token


def get_provider() -> LLMProvider:
    """Return the configured provider."""
    return OllamaProvider(config.EMBED_MODEL, config.GEN_MODEL)
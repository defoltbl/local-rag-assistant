"""Pluggable LLM provider layer.
"""
from abc import ABC, abstractmethod

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
        """Return the model's answer given a system and user message."""


class OllamaProvider(LLMProvider):
    """Talks to a local Ollama server on localhost:11434."""

    def __init__(self, embed_model: str, gen_model: str):
        self.embed_model = embed_model
        self.gen_model = gen_model

    def embed(self, text: str) -> np.ndarray:
        resp = ollama.embeddings(model=self.embed_model, prompt=text)
        vec = np.array(resp["embedding"], dtype=np.float32)
        return vec / np.linalg.norm(vec)

    def generate(self, system: str, user: str) -> str:
        resp = ollama.chat(
            model=self.gen_model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        return resp["message"]["content"]


def get_provider() -> LLMProvider:
    """Return the configured provider. Swap the implementation here later."""
    return OllamaProvider(config.EMBED_MODEL, config.GEN_MODEL)
"""Public access layer for the governed Ursus failure-mode taxonomy."""

from .registry import (
    canonicalize_failure_mode,
    clear_taxonomy_cache,
    get_component,
    get_family,
    get_mechanism,
    get_taxonomy_entry,
)

__all__ = [
    "canonicalize_failure_mode",
    "clear_taxonomy_cache",
    "get_component",
    "get_family",
    "get_mechanism",
    "get_taxonomy_entry",
]

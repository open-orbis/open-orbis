"""Unit tests for processing counter."""

from __future__ import annotations

import pytest
from app.cv.counter import increment, decrement, get_count

def test_counter_workflow():
    """Test the in-memory counter workflow."""
    initial = get_count()
    
    increment()
    assert get_count() == initial + 1
    
    decrement()
    assert get_count() == initial
    
    # Test decrementing below zero
    while get_count() > 0:
        decrement()
    
    assert get_count() == 0
    decrement()
    assert get_count() == 0

"""Deskly as a Vercel Python function: the same handler deskly.py runs locally.

vercel.json rewrites /api/v2/* and /deskly here. State is in memory, so on a hosted
deploy tickets and dashboard events last only as long as the function instance stays
warm; for a durable demo, run deskly.py locally.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "helpdesk"))

from deskly import Handler  # noqa: E402


class handler(Handler):  # Vercel's Python runtime looks for a top-level `handler` class
    pass

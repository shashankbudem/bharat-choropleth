"""Make the local ``src`` package importable for bare unittest discovery.

Users of the package install it normally; this only supports contributor runs
such as ``python3 -m unittest discover -s tests -v`` without first creating an
editable environment.
"""

from pathlib import Path
import sys


SRC = Path(__file__).resolve().parents[1] / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

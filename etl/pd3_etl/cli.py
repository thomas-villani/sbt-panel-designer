import logging
import os
import sys

from . import catalog, instruments, modules, pubs

COMMANDS = {"instruments": instruments.main, "catalog": catalog.main, "modules": modules.main, "pubs": pubs.main}


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    # Progress goes to stderr via logging; the stats summary stays on stdout so it can be piped.
    logging.basicConfig(
        level=os.environ.get("PD3_LOG_LEVEL", "INFO").upper(),
        format="%(levelname)s %(name)s: %(message)s",
        stream=sys.stderr,
    )
    if not argv or argv[0] not in COMMANDS:
        print("usage: pd3-etl <" + "|".join(COMMANDS) + ">", file=sys.stderr)
        sys.exit(2)
    COMMANDS[argv[0]]()

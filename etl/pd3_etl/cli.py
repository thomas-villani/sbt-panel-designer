import sys

from . import catalog, instruments

COMMANDS = {"instruments": instruments.main, "catalog": catalog.main}


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if not argv or argv[0] not in COMMANDS:
        print("usage: pd3-etl <" + "|".join(COMMANDS) + ">")
        sys.exit(2)
    COMMANDS[argv[0]]()

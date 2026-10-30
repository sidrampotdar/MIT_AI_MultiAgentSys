"""MIT AI MultiAgentSys - Enterprise Onboarding System Main Entrypoint."""

import sys
from app.cli import main as run_cli
from app.tools.demo import main as run_demo
from app.tools.test_tools import test_all_tools


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "test":
        test_all_tools()
    elif len(sys.argv) == 1 or sys.argv[1] == "demo":
        scenario = sys.argv[2] if len(sys.argv) > 2 and sys.argv[1] == "demo" else "success"
        run_demo(scenario)
    else:
        run_cli(sys.argv[1:])


if __name__ == "__main__":
    main()

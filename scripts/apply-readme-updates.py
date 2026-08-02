#!/usr/bin/env python3
"""Extract and apply README updates from workflow journal.jsonl."""

import json
import re
import shutil
from pathlib import Path

JOURNAL_FILE = Path("/home/wunai/.claude/projects/-home-wunai-Disks-Data-my-project-Trap-Map/2dc65a0b-c8ba-4c21-8fdb-b1a306811e76/subagents/workflows/wf_7f04172e-092/journal.jsonl")
PACKAGES_DIR = Path("/home/wunai/Disks/Data/my-project/Trap-Map/packages")
BACKUP_DIR = PACKAGES_DIR.parent / '.claude' / 'readme-backups'

def extract_readme_from_result(result_text):
    """Extract README content between markers."""
    match = re.search(
        r'---UPDATED README START---\n(.*?)\n---UPDATED README END---',
        result_text,
        re.DOTALL
    )
    if match:
        return match.group(1)
    return None

def get_package_name_from_content(content):
    """Extract package name from the result content."""
    match = re.search(r'@trapmap/([a-z-]+)', content)
    if match:
        return match.group(1)
    return None

def main():
    print("Extracting README updates from journal.jsonl...")

    updates = {}

    # Read journal.jsonl
    with open(JOURNAL_FILE, 'r') as f:
        for line in f:
            try:
                data = json.loads(line.strip())
                if data.get('type') == 'result' and 'result' in data:
                    result_text = data['result']
                    if 'UPDATED README START' in result_text:
                        readme = extract_readme_from_result(result_text)
                        pkg_name = get_package_name_from_content(result_text)
                        if pkg_name and readme:
                            # Keep the latest update for each package
                            updates[pkg_name] = readme
                            print(f"✓ Found update for: {pkg_name}")
            except json.JSONDecodeError:
                continue

    print(f"\nFound {len(updates)} updates")

    if not updates:
        print("No updates to apply")
        return

    # Create backup directory
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    # Apply updates
    applied = 0
    for pkg_name, readme in updates.items():
        readme_path = PACKAGES_DIR / pkg_name / 'README.md'

        if not readme_path.parent.exists():
            print(f"✗ Package directory not found: {pkg_name}")
            continue

        # Backup original
        if readme_path.exists():
            backup_path = BACKUP_DIR / f"{pkg_name}-README.md.backup"
            shutil.copy2(readme_path, backup_path)
            print(f"  Backed up: {backup_path}")

        # Write new README
        with open(readme_path, 'w') as f:
            f.write(readme)
        print(f"✓ Applied: {readme_path}")
        applied += 1

    print(f"\nApplied {applied} updates")
    print(f"Backups saved to: {BACKUP_DIR}")

if __name__ == '__main__':
    main()

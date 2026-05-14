#!/usr/bin/env bash
# Pushes this project to the Classroom repo.
# Usage, after accepting the Classroom assignment in a browser, run
#   bash push_to_classroom.sh <CLASSROOM_REPO_URL>
# where <CLASSROOM_REPO_URL> looks like
#   https://github.com/CECS-429-Spring-2026/project-2-PaulSemaan007.git

set -e

if [ -z "$1" ]; then
  echo "Usage, bash push_to_classroom.sh <CLASSROOM_REPO_URL>"
  exit 1
fi

URL="$1"

if git remote get-url classroom >/dev/null 2>&1; then
  git remote set-url classroom "$URL"
else
  git remote add classroom "$URL"
fi

git fetch classroom 2>/dev/null || true

if git ls-remote --heads classroom main | grep -q main; then
  git pull classroom main --allow-unrelated-histories --no-edit || true
fi

git push classroom main
echo
echo "Pushed to $URL"
echo "Open it in a browser and verify the files are there."

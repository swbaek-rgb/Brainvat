#!/bin/sh
# 공개 배포본 만들기: prototype/vats_unlock.html(통 하나로 시작, 점수로 해제) → docs/
# 다시 배포할 때: sh scripts/build-site.sh && git add docs && git commit -m "deploy" && git push
set -e
cd "$(dirname "$0")/.."
rm -rf docs && mkdir -p docs/sprites
cp prototype/sim.js prototype/events.js prototype/genetics.js docs/
for f in tank_sheet tank_praying tank_dead tank_empty intro_1 intro_2; do cp "prototype/sprites/$f.png" docs/sprites/; done
# 공개용: 인트로와 튜토리얼은 첫 실행에만
sed -e 's/^const INTRO_ALWAYS = true;/const INTRO_ALWAYS = false;/' \
    -e 's/^const TOUR_ALWAYS = true;/const TOUR_ALWAYS = false;/' \
    prototype/vats_unlock.html > docs/index.html
touch docs/.nojekyll
echo "built docs/ ($(du -sh docs | cut -f1))"

---
name: history
description: これまでの歩みを見せる。「/history」「これまでの進み具合を見たい」のときに使う。
---

# /history

1. `node scripts/history.mjs` を実行する
2. 節目と月ごとの活用日数を見せ、先月の自分と比べて変わったことを一言添える。人と比べない
3. `milestones.json` が変わっていたら、`git add milestones.json` のあと `git commit -m "歩みの更新" -- milestones.json` を実行して push する
4. 節目の日付はチームと大東にも見えること、活用日数の推移はチームには見えないことを、聞かれたら伝える

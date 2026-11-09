---
name: work
description: 取り組み(進める仕事の単位)を始める、動かす、休む、再開する、一区切りにする。「/work」「新しい取り組みを始めたい」「別の仕事も並行して進めたい」「この取り組みを休みたい」のときに使う。
---

# /work

取り組みは、受講者が進める仕事1つ分の単位。works.json に記録される。フェーズ1から4のどこからでも始められ、同じフェーズをやり直してよく、休んでもよい。

1. 最初に `node scripts/work.mjs list` を実行し、いまの取り組みと、それぞれの次にやることを受講者に見せる
2. 受講者の希望に合わせて、次のどれかを実行する。実行する前に、何をするかを1文で伝える
   - 始める: `node scripts/work.mjs new <名前> [--phase N]`。環境づくりが終わっていないと止まる。フェーズを決めていなければ 1 から始める
   - 動かす(進める、戻す、やり直す): `node scripts/work.mjs move <slug> <N>`
   - 次にやることを書き換える: `node scripts/work.mjs next <slug> <文>`
   - 休む: `node scripts/work.mjs pause <slug>`
   - 再開する: `node scripts/work.mjs resume <slug>`
   - 一区切りにする(同じフェーズをもう1回やった記録): `node scripts/work.mjs round <slug>`
   - 判定の結果を回数に反映する: `node scripts/work.mjs sync`
3. 止まったときは、表示された理由をそのまま受講者に伝える。works.json が壊れている場合は書き換えず、大東への相談を案内する
4. 取り組みの名前に顧客名や個人名を入れない(「提案書づくり」「請求の自動化」のように仕事の内容で付ける)。入っていたら、言い換えを提案する
5. 結果を伝え、保存してよいか受講者に確かめる。了承されたら `git add works.json works/` のあと `git commit -m "取り組みの更新"` を実行して push する

短く終える。フェーズの進み方や次の一手を決めるときは /next を案内する。

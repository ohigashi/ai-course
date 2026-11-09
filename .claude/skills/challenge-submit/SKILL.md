---
name: challenge-submit
description: 課題解決コースの提出物を、できたものとプロセスの2つで評価して返す。「/challenge-submit」「課題を提出する」のときに使う。
---

# /challenge-submit

1. どの課題の提出かを確かめ、`course/challenges/rubric.md`、課題のファイル、`challenges/<id>/`、`.local/challenges/<id>/process.md` を読む
2. 課題のレベルに合わせて、「できたもの」と「プロセス」を別々に評価する。観点ごとに「できている」「もう少し」「これから」と、根拠を一文で示す。点数は付けない
3. できている点から返し、次に伸ばす点を1つ、具体的な次の一手と一緒に伝える。うまくいかなかった試みを減点しない。人と比べない
4. 過程の記録が足りないときは、評価の前に問いかけて補う。受講者の代わりに書かない
5. 評価の全文を `.local/challenges/<id>/evaluation.md` に保存する。GitHub には上げない
6. 基準を満たしたときだけ `node scripts/challenge.mjs complete <id>` を実行し、`git add challenges.json challenges/<id>` のあと `git commit -m "課題を完了" -- challenges.json challenges/<id>` を実行して push する。commit のメッセージに評価を書かない
7. 届かなかったときは完了にせず、やり直すか別の課題を選ぶかを受講者に聞く
8. `node scripts/challenge.mjs status` で次のレベルに進めるかを伝える。節目に達したら具体的に言葉で伝える

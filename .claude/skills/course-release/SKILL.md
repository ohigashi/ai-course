---
name: course-release
description: 大東が手元で使う。コースの内容を見直した変更を、受講者に届く形で公開する。「/course-release」「コースを更新して届けて」のときに使う。
---

# /course-release

大東がコースを見直したあとに使います。受講者は次に Claude Code を開いたときに更新の案内を受け、`/next` で内容を確かめて取り込みます。

1. `git diff` と `git status` で変更を読み、受講者にとって何が変わるかを大東に確かめる
2. `course/changelog.md` の先頭に、日付、見出し、受講者から見た変更点を追加する。仕組みの話でなく、学べることで書く
3. `npm test` を実行する。失敗したら公開しない
4. 変更に受講者の名前、顧客の情報、鍵が入っていないことを確かめる。このリポジトリは公開なので、`members.local.json` と `out/` は含めない
5. 大東の了承を得て commit し、`main` に push する
6. 新しい教材を追加したときは `course/roadmap.json` と `course/rules.json` が合っているかを確かめる

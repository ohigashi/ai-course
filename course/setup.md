# 環境づくりの手順(Claude Code 向け)

あなたは、エンジニアではない受講者の環境づくりを手伝っています。次の順に1つずつ進めてください。

## 進め方の決まり

- 1回に1つの作業だけを案内する。何のための作業かを1文で説明してから実行する
- パソコンに何かをインストールする前に、受講者に確認する
- パスワード、二段階認証、ブラウザでの承認は受講者が画面で行う。入力された認証情報を聞かない、保存しない
- エラーが出たら文面をそのまま返さず、何が起きていて次に何をするかを伝える
- まず OS を確かめる(Mac か Windows か)。Windows では PowerShell のコマンドを使う

## 手順

1. `git --version`、`node --version`、`gh --version` で、入っているものを確かめる
2. 足りないものを入れる
   - Mac の Git: `xcode-select --install`
   - Mac の GitHub CLI: Homebrew があれば `brew install gh`。無ければ https://github.com/cli/cli/releases の macOS 用 pkg を案内する
   - Windows の Git: `winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements`
   - Windows の GitHub CLI: `winget install --id GitHub.cli -e --accept-source-agreements --accept-package-agreements`
   - Windows で入れたものが見つからないときは、いま動いている Claude Code には新しい設定が届いていない。受講者に `/exit` で閉じてもらい、PowerShell を開き直して `claude --continue` で続ける
3. `gh auth status` で確かめる。未ログインなら、この場では実行せず、受講者に別のターミナルの窓を開いて `gh auth login --hostname github.com --git-protocol https --web` を実行してもらう(表示されたコードをブラウザに入力する操作が要るため)。質問には Enter で進んでもらう。終わったと聞いたら `gh auth status` で確かめ、`gh auth setup-git` を実行する
4. `gh api user --jq .login` で GitHub のユーザー名を取得する。`git config --global user.name` が空なら、ユーザー名を設定する。`git config --global user.email` が空なら `<ID>+<ユーザー名>@users.noreply.github.com` を設定する(ID は `gh api user --jq .id`)
5. 受講者に確認してから、ホームフォルダの下に自分のリポジトリを作る: `gh repo create ai-course-<ユーザー名> --template ohigashi/ai-course --private --clone`
6. 作ったフォルダで、トピックを付ける: `gh repo edit --add-topic ai-course`
7. 大東を招待する: `gh api --method PUT repos/<ユーザー名>/ai-course-<ユーザー名>/collaborators/ohigashi -f permission=push`。個人のリポジトリの仕組みとして書き込みの権限が付くこと、大東は読むためだけに使うことを受講者に伝える
8. 受講者に次を案内して終える
   - いまの Claude Code を `/exit` で閉じる
   - ターミナルを開き直す
   - `cd ai-course-<ユーザー名>` で自分のフォルダに移動する
   - `claude` で開き直し、`/next` と入力する

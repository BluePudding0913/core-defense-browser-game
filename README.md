# CORE DEFENSE

スマートフォン・PCのブラウザで遊べる、4人協力型の2D防衛アクションゲームのプロトタイプです。武器や防衛設備を整え、COREを50ラウンド守ります。空席はCPUが担当するため、1人でも遊べます。

## 起動

JDK 17以上が必要です。Mavenの事前インストールは不要です。

1. `test-build-and-run.bat`を実行して、ビルドとサーバー起動を行います。
2. ブラウザで <http://localhost:8080/client/> を開きます。
3. 「クイックマッチ」または「合言葉」で参加します。ゲスト全員が準備完了になるとホストが開始できます。

ビルド済みなら`run-existing-jar.bat`で起動できます。終了時は、起動した2つのウィンドウを閉じてください。

スマートフォンでは同じWi-Fiに接続し、`http://PCのローカルIP:8080/client/`を開きます。PCのファイアウォールで8080・8887番ポートの許可が必要です。

手動で起動する場合は、ゲームサーバーを起動します。

```powershell
cd server
.\mvnw.cmd package
java -jar target\core-defense-server.jar
```

別のPowerShellをプロジェクト直下で開き、ブラウザ用サーバーを起動します。

```powershell
jwebserver -p 8080
```

## 基本操作

| 操作 | PC |
| --- | --- |
| 移動・ダッシュ | WASD・Shift |
| 射撃・連射 | 左クリック・長押し |
| 購入・クラフト・設置・設備操作 | R（長押しでCOREや設備を持ち上げ） |
| 所持品 | E |
| 武器・設置物の切り替え | マウスホイール・数字キー1〜9 |
| 回復キット使用 | H |

スマートフォンでは仮想スティックと画面上のボタンを使います。詳しいルールはゲーム内の「遊び方」を参照してください。

## 開発

- `client/`：ブラウザ画面・入力・描画
- `server/`：Java製WebSocketサーバー・ゲームルール
- `shared/map.json`：マップ・施設配置・販売価格（変更後はサーバーを再ビルド）
- `server/src/main/java/example/GameConfig.java`：武器性能などの設定

サーバーの自動テストは`server/`で`.\mvnw.cmd test`を実行します。`package`でも同じテストが実行されます。
クライアントの回帰テストはプロジェクト直下で、対象の`client/tests/*.cjs`をNode.jsで実行します（例：`node client/tests/menu-ui.cjs`）。`rooms-server.cjs`はビルド済みサーバーとNode.js 22以上が必要です。

マップの出現地点・経路は`?debug=1`で確認できます。部屋負荷の測定は[実装結果](docs/room-performance-results.md)を参照してください。

## 公開時の注意

ローカルまたは信頼できるLANでのテストを想定しています。ゲームサーバーの8887番ポートをインターネットへ直接公開しないでください。一般公開にはTLS・認証などの対策が必要です。詳細は[SECURITY.md](SECURITY.md)を参照してください。

静的ホスティングだけでは遊べません。Javaゲームサーバーを別途起動し、HTTPSの画面からはWSSで接続できるようにする必要があります。

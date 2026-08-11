# セットアップとデプロイ

## 開発環境

- macOS（Apple Siliconを含む）
- Arduino IDE
- ESP8266ボードパッケージ
- BME280用の既存処理に必要なライブラリ
- ArduinoJson（GAS送信用）

ESP8266の書き込みポートは接続状況で変わるため、固定値として文書やコードに保存しない。シリアルモニターは115200 baudを使用する。

## 秘密情報

Wi-Fi SSID、Wi-Fiパスワード、GAS WebアプリURL、GAS APIトークンはローカル設定ファイルへ記載する。実ファイルは`.gitignore`対象とし、Publicリポジトリへ追加しない。

ファームウェアの`secrets.h`は、`secrets.example.h`をコピーして次の4項目を設定する。

| 定義名 | 設定値 |
| --- | --- |
| `WIFI_SSID` | Wi-Fi SSID |
| `WIFI_PASSWORD` | Wi-Fiパスワード |
| `GAS_URL` | GAS Webアプリの`/exec` URL |
| `GAS_API_TOKEN` | GASのScript Propertiesに設定した`API_TOKEN`と同じ値 |

秘密情報を含むファイルを誤ってコミットした場合は、単に削除するだけでなく、該当するパスワードやトークンを無効化・再発行する。

## GASデプロイ

### 本番デプロイ前の準備

次の作業は、対象コードと設定値を人間が確認し、明示的に承認してから行う。

1. 使用するコミットまたはPRの実装内容を確認する。可能なら`main`へマージ済みのコードを使用する。
2. Googleスプレッドシートを作成し、1行目を次の列順にする。シート名は`DATA`とする（Phase 7で決定）。

   ```text
   日時 | temp | press | hum
   ```

   日時はDate値で書き、列の表示形式を`yyyy-MM-dd HH:mm:ss`にする（Phase 7で決定。Phase 8の実装で反映）。
3. スプレッドシートのタイムゾーンを`Asia/Tokyo`に設定する。
4. Google Apps Scriptプロジェクトを作成し、`gas/Code.gs`の内容を配置する。
5. GASプロジェクトのタイムゾーンを`Asia/Tokyo`に設定する。
6. `appsscript.json`にWebアプリ設定があることを確認する。CLIで同期する場合は、次の設定を含める。

   ```json
   "webapp": {
     "executeAs": "USER_DEPLOYING",
     "access": "ANYONE_ANONYMOUS"
   }
   ```

7. GASエディタの **プロジェクトの設定 → スクリプト プロパティ** で、次の3項目を登録する。値は公開リポジトリ、Issue、ログ、スクリーンショットへ記録しない。

   | 名前 | 設定値 |
   | --- | --- |
   | `SPREADSHEET_ID` | スプレッドシートURLの`/d/`と`/edit`の間にあるID |
   | `API_TOKEN` | 任意の十分に長いランダム文字列 |
   | `SHEET_NAME` | 追記先シート名。Phase 7の決定により`DATA` |

   Script Propertiesはスクリプト単位で共有される設定値で、コードへ秘密情報を埋め込まずに保存できる。設定後、キー名の誤字、対象シート名、スプレッドシートへの編集権限を確認する。

### Webアプリの本番デプロイ（GASエディタ）

1. GASエディタ右上の **デプロイ → 新しいデプロイ** を選択する。
2. 種類で **ウェブアプリ** を選択する。
3. 実行ユーザーは、スプレッドシートへ書き込めるデプロイ担当者（通常は自分）を選択する。
4. アクセスできるユーザーは、ESP8266がOAuthなしでPOSTできるよう **全員（匿名ユーザーを含む）** を選択する。
5. **デプロイ** を押し、初回の権限確認が表示されたら、内容を確認して承認する。
6. 発行された本番URLの `/exec` URLをコピーする。開発用の `/dev` URLは編集権限が必要で、最新保存コードのテスト専用なので、ESP8266や本番curlには使用しない。
7. `/exec` URLと`API_TOKEN`を、ローカルの`secrets.h`などの無視対象設定へ登録する。URLとトークンを同じ公開資料へ記録しない。

匿名アクセスを有効にできないGoogle Workspace環境では、このESP8266構成のままでは利用できない。アクセス設定を緩める前に、組織の管理者ポリシーを確認する。トークンは偶発的アクセスの防止用であり、強固な認証ではない。

### Webアプリの本番デプロイ（clasp）

`gas/`ディレクトリに`.clasp.json`があり、対象GASプロジェクトへログイン済みであることを前提とする。

```sh
cd gas
clasp push --force
clasp create-deployment --description "production"
clasp deployments
clasp open-web-app DEPLOYMENT_ID --json
```

`clasp open-web-app --json` がURLを返し、`/exec`で終わることを確認する。`No web app entry point found` と表示された場合、そのデプロイはWebアプリとして作成されていないため、GASエディタの **デプロイ → 新しいデプロイ → ウェブアプリ** から作成する。
### GASデプロイURL固定ルール

ESP8266ファームウェアの`GAS_URL`はビルド時に固定される。このため、GASを更新する際は**本番Webアプリの`/exec` URLを変更してはならない**。以下のルールに従う。

- **既存デプロイを更新する**。新しいWebアプリデプロイを作ってURLを変更してはならない。
- **デプロイIDを維持する**。`clasp deployments` または GASエディタの**デプロイを管理**で既存デプロイのIDを確認し、同じIDでバージョン更新する。
- **更新前後でURLを確認する**。更新前の`/exec` URLを記録し、更新後も同一であることを`curl -L -sS -i \"$GAS_URL\"`などで確認する。
- **ロールバック可能にしておく**。デプロイID、バージョン、実施日時は個人用の非公開記録へ残す。問題が発生した場合は、同じデプロイIDで直前の正常バージョンに戻す。
- **公開記録へURLやトークンを残さない**。`docs/test-results/` や公開リポジトリへ`/exec` URL、`API_TOKEN`、スプレッドシートIDを記載しない。

### 本番スモークテスト

実URLへのテストは、テスト用シートまたは削除してよいテスト行を使う。シェル履歴やCIログへトークンを出さない。

まず、トークンを送らないGETで設定状態を確認する。

```sh
read -r GAS_URL
curl -L -sS -i "$GAS_URL"
```

設定済みで対象シートへアクセスできる場合は`{"ok":true,"ready":true}`、未設定またはアクセス不能の場合は`{"ok":false,"ready":false,"error":"not_ready"}`を期待する。Ready確認は行を追加しない。

```sh
read -r -s API_TOKEN
printf '\n'

curl -L -sS -i -X POST "$GAS_URL" \
  -H 'Content-Type: application/json' \
  -d "{\"api_version\":1,\"token\":\"$API_TOKEN\",\"temp\":24.5,\"press\":1012.3,\"hum\":55.8}"
```

確認結果：

- HTTPステータスが200である。
- 本文が`{"ok":true}`である。
- シートに`Asia/Tokyo`の日時、`24.5`、`1012.3`、`55.8`の1行が追加される。
- レスポンス本文やシートにトークンが出力されていない。

次に、行が追加されないことを確認する異常系を実施する。

```sh
# 不正トークン: invalid_token
curl -L -sS -i -X POST "$GAS_URL" \
  -H 'Content-Type: application/json' \
  -d '{"api_version":1,"token":"wrong-token","temp":24.5,"press":1012.3,"hum":55.8}'

# 範囲外: invalid_payload
curl -L -sS -i -X POST "$GAS_URL" \
  -H 'Content-Type: application/json' \
  -d "{\"api_version\":1,\"token\":\"$API_TOKEN\",\"temp\":85.1,\"press\":1012.3,\"hum\":55.8}"
```

異常系はHTTPステータスではなく、本文の`{"ok":false,"error":"..."}`で判定する。テスト後、実施日時（JST）、成功・異常系の結果、使用したデプロイのバージョンを秘密情報なしで`docs/test-results/`へ記録する。

最初にHTTP 302が返るのはGASのContent Serviceによるリダイレクトとして正常である。`-L`で追従する。リダイレクト後にHTTP 405（`Allow: HEAD, GET`）が返る場合は、URLが`/exec`か、デプロイがWebアプリか、匿名アクセスが有効か、`doPost(e)`を含むバージョンをデプロイしたかを確認する。

### 更新とロールバック

- コードを変更した場合は、まず`/dev`のテストデプロイで確認する。
- 本番反映は **デプロイ → デプロイを管理** から既存デプロイを新しいバージョンへ更新する。既存の`/exec` URLを維持できるため、設定済みのESP8266 URLを変更しない運用にする。
- 更新後に正常系・異常系のcurlスモークテストを再実施する。
- 問題が出た場合は、**デプロイを管理** から直前の正常バージョンへ戻し、再度curlで確認する。
- デプロイID、バージョン、実施日時は個人用の非公開記録へ残す。URL、トークン、スプレッドシートIDは公開記録へ残さない。

公式手順：[Apps Script Web Apps](https://developers.google.com/apps-script/guides/web)、[Properties Service](https://developers.google.com/apps-script/guides/properties)

## ESP8266書き込み

1. Arduino IDEで対象スケッチを開く
2. ESPr Developer / ESP8266向けのボード設定を選択する
3. シリアルポートを接続状態から確認する
4. コンパイルする
5. 内容を確認したうえで書き込む
6. 115200 baudでシリアルログを確認する

ESP8266への書き込みは人間の確認後に実施する。Codexは書き込み完了を、実際のログなしに推測しない。

## 追加機能のセットアップ（Phase 11 / 12 / 15 対応）

以下は監視・LINE・日次集計を有効化する際の追加設定。実装済みのPhase（Phase 8以降）に応じて、
該当するものを人間が確認・承認してから設定する。

### Script Properties の追加キー（監視・LINE・日次集計）

受信基盤の `SPREADSHEET_ID` / `API_TOKEN` / `SHEET_NAME` に加え、機能に応じて追加する。実値は公開資料へ記載しない。

| キー | 内容 | 対応Phase |
| --- | --- | --- |
| `LINE_CHANNEL_SECRET` | LINEチャネルシークレット（Webhook署名検証用） | 12 |
| `LINE_ACCESS_TOKEN` | LINEアクセストークン（Push/Reply送信用） | 12 |
| `LINE_USER_ID` | 通知送信先ユーザーID | 12 |
| `ONHOLD_TIME` | スキップ停止時刻（ISO 8601 文字列で保存） | 12 |

監視閾値など頻繁に調整する値は、Configシート採用時はそちらへ置く（Phase 15 の決定Issueを参照）。

### LINEチャネル / Webhook設定（Phase 12）

1. LINE Developerコンソールでチャネルを作成し、チャネルシークレットとアクセストークンを取得する。
2. Webhook URL に GAS Webアプリの `/exec` URL を設定する。
3. 送信はReply API（`/message/reply`）とPush API（`/message/push`）を使う。無料プランではPushの月200通制限があり、Replyはカウントされない。

### Configシート / Dailyシート（Phase 15）

1. Configシートを作成し、1行目にキー名、2行目以降に値を配置する（採用は決定済み）。未設定キーは Script Properties 内のデフォルト値にフォールバックする。既定値は下表のとおり。

   | キー | 既定値（決定済み） | 内容 |
   | --- | --- | --- |
   | `TEMP_HIGH` | 30.0 | 気温超過しきい値（℃） |
   | `HUM_HIGH` | 70 | 湿度超過しきい値（%） |
   | `HEAT_INDEX_HIGH` | 80.0 | 簡易暑さ指数（不快指数DI）超過しきい値 |
   | `HYSTERESIS_TEMP` | 0.5 | 気温ヒステリシス幅（℃） |
   | `HYSTERESIS_HUM` | 5 | 湿度ヒステリシス幅（%） |
   | `HYSTERESIS_HEAT_INDEX` | 0.5 | 簡易暑さ指数ヒステリシス幅 |
   | `SMOOTH_K` | 2 | 連続超過判定の件数K |
   | `ANOMALY_TEMP` | 5.0 | 異常値判定の気温変化量（℃） |
   | `ANOMALY_HUM` | 30 | 異常値判定の湿度変化量（%） |
   | `ANOMALY_PRESS` | 20 | 異常値判定の気圧変化量（hPa） |
   | `WATCHDOG_TIMEOUT_MIN` | 4320 | センサー未受信ウォッチドッグのしきい値（分）。4320＝3日 |

2. Dailyシートを作成し、1行目を `日付 | temp_avg/min/max | hum_avg/min/max | press_avg/min/max | sample_count | alert_count` にする。
3. 時間主導トリガーを設定し、日付境界+10分程度に日次集計を実行する。
4. Monthlyシートを作成し、1行目を `年月 | temp_avg/min/max | hum_avg/min/max | press_avg/min/max | days_count` にする。月次トリガー（例: 1日0:10）で前月分を月次集計する。
5. ウォッチドッグ用の時間主導トリガー（例: 1日1回）を設定する。DATA最終日時が `WATCHDOG_TIMEOUT_MIN`（既定4320＝3日）を超えると1回だけ通知し、復帰（追記再開）でリセットする。

※LINE設定・Config/Daily/Monthlyシート作成・トリガー設定は人間の承認後に実施する。

## リリース

実機で安定動作を確認したファームウェアには、例えば次のタグを付ける。

```text
v0.1.0-gas-api
v0.2.0-first-device-upload
v1.0.0-stable
```

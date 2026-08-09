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

秘密情報を含むファイルを誤ってコミットした場合は、単に削除するだけでなく、該当するパスワードやトークンを無効化・再発行する。

## GASデプロイ

### 本番デプロイ前の準備

次の作業は、PRの内容と設定値を人間が確認してから行う。GAS本番デプロイはCodexが代行しない。

1. [PR #8](https://github.com/tahosook/esp-bme280-gas-logger/pull/8) の実装内容を確認し、`main`へマージする。
2. Googleスプレッドシートを作成し、1行目を次の列順にする。

   ```text
   日時 | temp | press | hum
   ```

3. スプレッドシートのタイムゾーンを`Asia/Tokyo`に設定する。
4. Google Apps Scriptプロジェクトを作成し、`gas/Code.gs`の内容を配置する。
5. GASプロジェクトのタイムゾーンを`Asia/Tokyo`に設定する。
6. GASエディタの **プロジェクトの設定 → スクリプト プロパティ** で、次の3項目を登録する。値は公開リポジトリ、Issue、ログ、スクリーンショットへ記録しない。

   | 名前 | 設定値 |
   | --- | --- |
   | `SPREADSHEET_ID` | スプレッドシートURLの`/d/`と`/edit`の間にあるID |
   | `API_TOKEN` | 任意の十分に長いランダム文字列 |
   | `SHEET_NAME` | 追記先シート名。未設定なら`Sheet1` |

   Script Propertiesはスクリプト単位で共有される設定値で、コードへ秘密情報を埋め込まずに保存できる。設定後、キー名の誤字、対象シート名、スプレッドシートへの編集権限を確認する。

### Webアプリの本番デプロイ

1. GASエディタ右上の **デプロイ → 新しいデプロイ** を選択する。
2. 種類で **ウェブアプリ** を選択する。
3. 実行ユーザーは、スプレッドシートへ書き込めるデプロイ担当者（通常は自分）を選択する。
4. アクセスできるユーザーは、ESP8266がOAuthなしでPOSTできるよう **全員（匿名ユーザーを含む）** を選択する。
5. **デプロイ** を押し、初回の権限確認が表示されたら、内容を確認して承認する。
6. 発行された本番URLの `/exec` URLをコピーする。開発用の `/dev` URLは編集権限が必要で、最新保存コードのテスト専用なので、ESP8266や本番curlには使用しない。
7. `/exec` URLと`API_TOKEN`を、ローカルの`secrets.h`などの無視対象設定へ登録する。URLとトークンを同じ公開資料へ記録しない。

匿名アクセスを有効にできないGoogle Workspace環境では、このESP8266構成のままでは利用できない。アクセス設定を緩める前に、組織の管理者ポリシーを確認する。トークンは偶発的アクセスの防止用であり、強固な認証ではない。

### 本番スモークテスト

実URLへのテストは、テスト用シートまたは削除してよいテスト行を使う。シェル履歴やCIログへトークンを出さない。

```sh
read -r GAS_URL
read -r -s API_TOKEN
printf '\n'

curl -sS -i -X POST "$GAS_URL" \
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
curl -sS -i -X POST "$GAS_URL" \
  -H 'Content-Type: application/json' \
  -d '{"api_version":1,"token":"wrong-token","temp":24.5,"press":1012.3,"hum":55.8}'

# 範囲外: invalid_payload
curl -sS -i -X POST "$GAS_URL" \
  -H 'Content-Type: application/json' \
  -d "{\"api_version\":1,\"token\":\"$API_TOKEN\",\"temp\":85.1,\"press\":1012.3,\"hum\":55.8}"
```

異常系はHTTPステータスではなく、本文の`{"ok":false,"error":"..."}`で判定する。テスト後、実施日時（JST）、成功・異常系の結果、使用したデプロイのバージョンを秘密情報なしで`docs/test-results/`へ記録する。

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

## リリース

実機で安定動作を確認したファームウェアには、例えば次のタグを付ける。

```text
v0.1.0-gas-api
v0.2.0-first-device-upload
v1.0.0-stable
```

/**
 * tests/setup.js
 *
 * Jest グローバルセットアップ: .gs 拡張子のロード許可と GAS グローバル関数の初期化
 */

// Node.js で .gs ファイルを CommonJS require 可能にする
if (require.extensions) {
  require.extensions['.gs'] = require.extensions['.js'];
}

// GAS グローバルモックのデフォルト定義
const { createGasMockEnvironment } = require('./helpers/mockGasEnvironment');
const defaultEnv = createGasMockEnvironment();

Object.assign(global, defaultEnv.globals);

// GAS モジュール群のロード
const Config = require('../gas/Config.gs');
const ErrorLog = require('../gas/ErrorLog.gs');
const Metrics = require('../gas/Metrics.gs');
const Monitor = require('../gas/Monitor.gs');
const Ingest = require('../gas/Ingest.gs');
const Router = require('../gas/Router.gs');
const DailyAggregation = require('../gas/DailyAggregation.gs');
const MonthlyAggregation = require('../gas/MonthlyAggregation.gs');
const LineBot = require('../gas/LineBot.gs');
const SetupTriggers = require('../gas/SetupTriggers.gs');
const DebugTest = require('../gas/DebugTest.gs');

// GAS 同士のファイル間直接参照を可能にするため global にも関数群をマウント
Object.assign(global, Config);
Object.assign(global, ErrorLog);
Object.assign(global, Metrics);
Object.assign(global, Monitor);
Object.assign(global, Ingest);
Object.assign(global, Router);
Object.assign(global, DailyAggregation);
Object.assign(global, MonthlyAggregation);
Object.assign(global, LineBot);
Object.assign(global, SetupTriggers);
Object.assign(global, DebugTest);

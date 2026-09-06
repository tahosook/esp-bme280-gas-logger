#!/usr/bin/env node

/**
 * scripts/deploy.js
 *
 * GAS 本番デプロイ自動化スクリプト
 * 1. 事前検証 (npm test & npm run lint)
 * 2. コードプッシュ (clasp push --force)
 * 3. バージョン作成 (clasp version)
 * 4. 既存本番デプロイの更新 (clasp redeploy <deploymentId>)
 * 5. Web アプリ GET スモークテスト (https://script.google.com/macros/s/<deploymentId>/exec)
 */

const { execSync, execFileSync } = require('child_process');
const path = require('path');
const https = require('https');

const ROOT_DIR = path.resolve(__dirname, '..');
const GAS_DIR = path.join(ROOT_DIR, 'gas');
const DEFAULT_DEPLOYMENT_ID = 'AKfycbzIWL_qZeVWYRFnM3sPXS0QeB5kaHR7cjd6C3ly1ifTqIkJGP0eBYOq4BBcKJK9k4Jp';

/**
 * コマンドライン引数をパースする
 */
function parseArgs(args = process.argv.slice(2)) {
  const options = {
    skipTests: false,
    skipLint: false,
    skipSmokeTest: false,
    dryRun: false,
    deploymentId: process.env.GAS_DEPLOYMENT_ID || DEFAULT_DEPLOYMENT_ID
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--skip-tests' || arg === '--skip-test') {
      options.skipTests = true;
    } else if (arg === '--skip-lint') {
      options.skipLint = true;
    } else if (arg === '--skip-smoke-test' || arg === '--skip-smoke') {
      options.skipSmokeTest = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--deployment-id' && i + 1 < args.length) {
      options.deploymentId = args[i + 1];
      i += 1;
    }
  }

  return options;
}

/**
 * 直近の git コミット情報からバージョン説明文を生成
 */
function buildVersionDescription(execFn = execSync) {
  try {
    const raw = execFn('git log -1 --format="%h - %s"', {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    const clean = raw.replace(/[\r\n]+/g, ' ');
    const desc = `production update from main ${clean}`;
    return desc.length > 100 ? desc.slice(0, 97) + '...' : desc;
  } catch (_e) {
    const nowStr = new Date().toISOString();
    return `production update ${nowStr}`;
  }
}

/**
 * clasp version の出力文字列からバージョン番号を抽出
 */
function parseVersionNumber(output) {
  if (typeof output !== 'string') return null;
  const match = output.match(/Created version\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Web アプリの GET スモークテストを実行（HTTP リダイレクト対応・再帰深度制限・相対URL解決付き）
 */
function runSmokeTest(url, timeoutMs = 15000, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      reject(new Error('Smoke test failed: Too many redirects'));
      return;
    }

    const req = https.get(url, (res) => {
      // 301, 302 リダイレクトを追跡（相対URLも正しく解決）
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        try {
          const nextUrl = new URL(res.headers.location, url).toString();
          runSmokeTest(nextUrl, timeoutMs, maxRedirects - 1)
            .then(resolve)
            .catch(reject);
        } catch (urlErr) {
          reject(new Error(`Failed to parse redirect URL (${res.headers.location}): ${urlErr.message}`));
        }
        return;
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.ok === true && json.ready === true) {
            resolve({ statusCode: res.statusCode, body: json });
          } else {
            reject(new Error(`Ready check failed: unexpected JSON response: ${data}`));
          }
        } catch (err) {
          reject(new Error(`Failed to parse response as JSON (status ${res.statusCode}): ${data.slice(0, 100)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Smoke test request timed out after ${timeoutMs}ms`));
    });
  });
}

/**
 * デプロイパイプラインの実行処理（DI 可能）
 */
async function runDeployPipeline(options, deps = {}) {
  const {
    execFn = execSync,
    execFileFn = execFileSync,
    smokeTestFn = runSmokeTest,
    logFn = console.log,
    errFn = console.error
  } = deps;

  logFn('🚀 GAS 本番デプロイ自動化スクリプトを開始します');
  logFn(`📌 対象デプロイ ID: ${options.deploymentId}`);
  if (options.dryRun) {
    logFn('⚠️ [DRY-RUN モード] 実際の push / version / redeploy は実行されません\n');
  }

  // Step 1: 事前検証 (Tests)
  if (!options.skipTests) {
    logFn('\n[Step 1/5] 🧪 テストを実行中 (npm test)...');
    execFn('npm test', { cwd: ROOT_DIR, stdio: 'inherit' });
    logFn('✅ テストに合格しました');
  } else {
    logFn('\n[Step 1/5] 🧪 テスト実行をスキップしました (--skip-tests)');
  }

  // Step 2: 事前検証 (Lint)
  if (!options.skipLint) {
    logFn('\n[Step 2/5] 🔍 コード解析を実行中 (npm run lint)...');
    execFn('npm run lint', { cwd: ROOT_DIR, stdio: 'inherit' });
    logFn('✅ Lint チェックに合格しました');
  } else {
    logFn('\n[Step 2/5] 🔍 Lint チェックをスキップしました (--skip-lint)');
  }

  // Step 3: clasp push
  logFn('\n[Step 3/5] 📤 リモートへコードをプッシュ中 (clasp push --force)...');
  if (!options.dryRun) {
    execFileFn('clasp', ['push', '--force'], { cwd: GAS_DIR, stdio: 'inherit' });
    logFn('✅ コードプッシュ完了');
  } else {
    logFn('   [DRY-RUN] clasp push --force');
    logFn('✅ [DRY-RUN] コードプッシュをシミュレート');
  }

  // Step 4: バージョン作成
  logFn('\n[Step 4/5] 🏷️ 新しいスクリプトバージョンを作成中 (clasp version)...');
  const description = buildVersionDescription(execFn);
  logFn(`   バージョン説明: "${description}"`);

  let newVersionNumber = null;
  if (!options.dryRun) {
    const versionOutput = execFileFn('clasp', ['version', description], {
      cwd: GAS_DIR,
      encoding: 'utf8'
    });
    logFn(`   ${String(versionOutput).trim()}`);
    newVersionNumber = parseVersionNumber(versionOutput);
    if (!newVersionNumber) {
      throw new Error(`スクリプトバージョン番号の取得に失敗しました: ${versionOutput}`);
    }
  } else {
    logFn(`   [DRY-RUN] clasp version "${description}"`);
  }

  // Step 5: 既存デプロイの更新 (Redeploy)
  const versionDisplay = options.dryRun ? '<生成予定>' : `@${newVersionNumber}`;
  logFn(`\n[Step 5/5] 🔄 本番 Web アプリデプロイを更新中 (${versionDisplay})...`);
  const deployDesc = `production update ${versionDisplay} - ${description}`;

  if (!options.dryRun) {
    const redeployArgs = ['redeploy', options.deploymentId, '-V', String(newVersionNumber), '-d', deployDesc];
    const redeployOutput = execFileFn('clasp', redeployArgs, {
      cwd: GAS_DIR,
      encoding: 'utf8'
    });
    logFn(`   ${String(redeployOutput).trim()}`);
    logFn(`✅ 本番 Web アプリデプロイ (${options.deploymentId}) を Version ${newVersionNumber} に更新しました`);
  } else {
    logFn(`   [DRY-RUN] clasp redeploy "${options.deploymentId}" -V <生成予定> -d "${deployDesc}"`);
    logFn(`✅ [DRY-RUN] 本番 Web アプリデプロイの更新をシミュレートしました`);
  }

  // Step 6: スモークテスト
  const webAppUrl = `https://script.google.com/macros/s/${options.deploymentId}/exec`;
  if (!options.skipSmokeTest && !options.dryRun) {
    logFn(`\n🔎 [Smoke Test] Web アプリ導通確認を実行中...`);
    logFn(`   URL: ${webAppUrl}`);
    try {
      const result = await smokeTestFn(webAppUrl);
      logFn(`✅ Ready 確認成功: HTTP ${result.statusCode}, response: ${JSON.stringify(result.body)}`);
    } catch (err) {
      errFn(`❌ スモークテスト失敗: ${err.message}`);
      throw new Error(`デプロイ後のスモークテストに失敗しました: ${err.message}`);
    }
  } else if (options.skipSmokeTest) {
    logFn('\n🔎 [Smoke Test] スモークテストをスキップしました (--skip-smoke-test)');
  } else {
    logFn(`\n🔎 [Smoke Test] [DRY-RUN] Web アプリ導通確認をシミュレート (${webAppUrl})`);
  }

  logFn('\n🎉 デプロイが正常に完了しました！');
  logFn(`   デプロイ ID: ${options.deploymentId}`);
  logFn(`   反映バージョン: ${versionDisplay}`);
  logFn(`   Web アプリ URL: ${webAppUrl}`);

  return {
    success: true,
    deploymentId: options.deploymentId,
    versionNumber: newVersionNumber,
    dryRun: options.dryRun
  };
}

/**
 * CLI エントリーポイント
 */
async function main() {
  const options = parseArgs();
  await runDeployPipeline(options);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\n💥 デプロイ処理中にエラーが発生しました:', err.message || err);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_DEPLOYMENT_ID,
  parseArgs,
  buildVersionDescription,
  parseVersionNumber,
  runSmokeTest,
  runDeployPipeline,
  main
};

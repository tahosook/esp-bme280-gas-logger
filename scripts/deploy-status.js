#!/usr/bin/env node

/**
 * scripts/deploy-status.js
 *
 * GAS 本番デプロイ状態の確認スクリプト
 * - 現在の GAS 本番デプロイバージョン (clasp deployments --json)
 * - バージョン説明文 (clasp versions --json)
 * - デプロイ説明文に記録されたコミットハッシュの抽出
 * - デプロイ時コミットからローカル HEAD までの gas/ 差分検証 (git diff)
 * - ローカルの未コミット変更検証 (git status --porcelain -- gas/)
 */

const { execSync } = require('child_process');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const GAS_DIR = path.join(ROOT_DIR, 'gas');
const DEFAULT_DEPLOYMENT_ID = 'AKfycbzIWL_qZeVWYRFnM3sPXS0QeB5kaHR7cjd6C3ly1ifTqIkJGP0eBYOq4BBcKJK9k4Jp';

function getDeployments(execFn = execSync) {
  try {
    const stdout = execFn('clasp deployments --json', {
      cwd: GAS_DIR,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    return JSON.parse(stdout);
  } catch (err) {
    throw new Error(`clasp deployments の取得に失敗しました: ${err.message}`);
  }
}

function getVersions(execFn = execSync) {
  try {
    const stdout = execFn('clasp versions --json', {
      cwd: GAS_DIR,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    return JSON.parse(stdout);
  } catch (_err) {
    return [];
  }
}

function getUncommittedGasChanges(execFn = execSync) {
  try {
    const stdout = execFn('git status --porcelain -- gas/', {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    if (!stdout) return [];
    return stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  } catch (_e) {
    return [];
  }
}

function extractCommitHashFromDescription(text) {
  if (typeof text !== 'string') return null;
  // "production update from main 35f727e" または単独の 7〜40文字の16進ハッシュを抽出
  const match = text.match(/(?:from main\s+|@\d+\s+-\s+|\[)([0-9a-f]{7,40})/i) ||
                text.match(/\b([0-9a-f]{7,40})\b/i);
  return match ? match[1] : null;
}

function getGasDiffSinceCommit(commitHash, execFn = execSync) {
  if (!commitHash) return null;
  try {
    // コミットがローカル Git 履歴に存在するか確認
    execFn(`git rev-parse --verify ${commitHash}^{commit}`, {
      cwd: ROOT_DIR,
      stdio: ['pipe', 'pipe', 'ignore']
    });

    const diffOutput = execFn(`git diff --name-only ${commitHash}..HEAD -- gas/`, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();

    if (!diffOutput) return [];
    return diffOutput.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch (_e) {
    return null; // コミットが見つからない等の例外
  }
}

function checkStatus(targetId = DEFAULT_DEPLOYMENT_ID, execFn = execSync) {
  const deployments = getDeployments(execFn);
  const target = deployments.find((d) => d.deploymentId === targetId) || null;
  const versions = getVersions(execFn);
  const uncommittedFiles = getUncommittedGasChanges(execFn);

  let versionDetail = null;
  if (target && target.versionNumber) {
    versionDetail = versions.find((v) => v.versionNumber === target.versionNumber) || null;
  }

  // デプロイ説明文またはバージョン説明文からデプロイされたコミットハッシュを抽出
  const deployedHash = extractCommitHashFromDescription(
    (versionDetail && versionDetail.description) || (target && target.description) || ''
  );

  const diffFiles = deployedHash ? getGasDiffSinceCommit(deployedHash, execFn) : null;

  // 厳密な状態判定
  let statusReason = 'UNKNOWN';
  let isDeployedMatch = false;

  if (!target) {
    statusReason = 'DEPLOYMENT_NOT_FOUND';
  } else if (uncommittedFiles.length > 0) {
    statusReason = 'UNCOMMITTED_CHANGES';
    isDeployedMatch = false;
  } else if (!deployedHash) {
    statusReason = 'NO_COMMIT_HASH_IN_DEPLOYMENT';
    isDeployedMatch = false;
  } else if (diffFiles === null) {
    statusReason = 'COMMIT_NOT_FOUND';
    isDeployedMatch = false;
  } else if (diffFiles.length > 0) {
    statusReason = 'DIFF_DETECTED';
    isDeployedMatch = false;
  } else {
    statusReason = 'UP_TO_DATE';
    isDeployedMatch = true;
  }

  return {
    targetId,
    deployment: target,
    versionDetail,
    deployedHash,
    uncommittedFiles,
    diffFiles,
    statusReason,
    isDeployedMatch
  };
}

function main() {
  console.log('🔍 GAS デプロイ状態を確認中...\n');
  const targetId = process.env.GAS_DEPLOYMENT_ID || DEFAULT_DEPLOYMENT_ID;

  try {
    const status = checkStatus(targetId);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📌 対象デプロイ ID: ${status.targetId}`);
    if (status.deployment) {
      console.log(`🏷️  反映中バージョン: @${status.deployment.versionNumber || 'HEAD'}`);
      console.log(`📝 デプロイ説明:   ${status.deployment.description || '(説明なし)'}`);
      if (status.versionDetail && status.versionDetail.description) {
        console.log(`🔖 バージョン詳細:  ${status.versionDetail.description}`);
      }
    } else {
      console.log(`⚠️  指定のデプロイ ID が見つかりませんでした。`);
    }

    console.log('───────────────────────────────────────────────────');
    if (status.deployedHash) {
      console.log(`📦 デプロイ時コミット: [${status.deployedHash}]`);
    } else {
      console.log(`📦 デプロイ時コミット: (説明文からハッシュを特定できませんでした)`);
    }

    if (status.uncommittedFiles.length > 0) {
      console.log(`⚠️  gas/ の未コミット変更 (${status.uncommittedFiles.length} 件):`);
      status.uncommittedFiles.forEach((f) => console.log(`   - ${f}`));
    }

    if (status.diffFiles && status.diffFiles.length > 0) {
      console.log(`⚠️  デプロイ後の未反映変更 (${status.diffFiles.length} ファイル):`);
      status.diffFiles.forEach((f) => console.log(`   - ${f}`));
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    switch (status.statusReason) {
      case 'UP_TO_DATE':
        console.log('✅ 【最新】現在デプロイされているコードは、ローカル最新状態と完全に一致しています。');
        break;
      case 'UNCOMMITTED_CHANGES':
        console.log('⚠️ 【未反映】ローカルの gas/ に未コミットの変更が存在します。');
        console.log('   変更をコミットした上で `npm run deploy` を実行してください。');
        break;
      case 'DIFF_DETECTED':
        console.log('⚠️ 【未反映】デプロイ時コミット以降に gas/ 配下への変更が検出されました。');
        console.log('   最新コードを反映するには `npm run deploy` を実行してください。');
        break;
      case 'NO_COMMIT_HASH_IN_DEPLOYMENT':
        console.log('ℹ️ 【要確認】デプロイ情報にコミットハッシュが記録されていません（手動デプロイ等の可能性）。');
        console.log('   最新コードを反映するには `npm run deploy` を実行してください。');
        break;
      case 'COMMIT_NOT_FOUND':
        console.log('⚠️ 【要確認】デプロイ説明文のコミットハッシュがローカル Git 履歴に見つかりません。');
        console.log('   最新コードを反映するには `npm run deploy` を実行してください。');
        break;
      case 'DEPLOYMENT_NOT_FOUND':
        console.log('❌ 【エラー】指定されたデプロイ ID が見つかりません。');
        break;
      default:
        console.log('⚠️ 【要確認】デプロイ状態の照合ができませんでした。');
    }
    console.log('');
  } catch (err) {
    console.error('❌ デプロイ状態の取得に失敗しました:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_DEPLOYMENT_ID,
  getDeployments,
  getVersions,
  getUncommittedGasChanges,
  extractCommitHashFromDescription,
  getGasDiffSinceCommit,
  checkStatus,
  main
};

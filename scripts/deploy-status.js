#!/usr/bin/env node

/**
 * scripts/deploy-status.js
 *
 * GAS 本番デプロイ状態の確認スクリプト
 * - 現在の GAS 本番デプロイバージョン (clasp deployments --json)
 * - バージョン説明文 (clasp versions --json)
 * - ローカルの最新コミット (git log)
 * - 未プッシュのファイル変更 (clasp status --json)
 * - デプロイ状態の判定 (最新 / 未反映 / 差分あり)
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

function getLocalRecentCommits(execFn = execSync) {
  try {
    const headHash = execFn('git log -1 --format="%h"', {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    const headMessage = execFn('git log -1 --format="%s"', {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();

    const gasHash = execFn('git log -1 --format="%h" -- gas/', {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    const gasMessage = execFn('git log -1 --format="%s" -- gas/', {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();

    return {
      head: { hash: headHash, message: headMessage },
      gas: { hash: gasHash, message: gasMessage }
    };
  } catch (_e) {
    return {
      head: { hash: 'unknown', message: 'unknown' },
      gas: { hash: 'unknown', message: 'unknown' }
    };
  }
}

function getClaspStatus(execFn = execSync) {
  try {
    const stdout = execFn('clasp status --json', {
      cwd: GAS_DIR,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    return JSON.parse(stdout);
  } catch (_e) {
    return null;
  }
}

/**
 * ワードバウンダリを考慮してハッシュ文字列が含まれているかを照合する
 */
function isHashMatch(hash, text) {
  if (!hash || hash === 'unknown' || !text) return false;
  const safeHash = hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${safeHash}\\b`, 'i').test(text);
}

function checkStatus(targetId = DEFAULT_DEPLOYMENT_ID, execFn = execSync) {
  const deployments = getDeployments(execFn);
  const target = deployments.find((d) => d.deploymentId === targetId);
  const versions = getVersions(execFn);
  const recentCommits = getLocalRecentCommits(execFn);
  const claspStatus = getClaspStatus(execFn);

  let versionDetail = null;
  if (target && target.versionNumber) {
    versionDetail = versions.find((v) => v.versionNumber === target.versionNumber) || null;
  }

  // デプロイ説明文またはバージョン説明文からコミットハッシュの有無を確認
  const combinedDesc = `${target && target.description ? target.description : ''} ${versionDetail && versionDetail.description ? versionDetail.description : ''}`;

  const isHeadMatch = isHashMatch(recentCommits.head.hash, combinedDesc);
  const isGasMatch = isHashMatch(recentCommits.gas.hash, combinedDesc);
  const isDeployedMatch = isHeadMatch || isGasMatch;

  return {
    targetId,
    deployment: target || null,
    versionDetail,
    recentCommits,
    claspStatus,
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
    console.log(`💻 ローカル HEAD:      [${status.recentCommits.head.hash}] ${status.recentCommits.head.message}`);
    if (status.recentCommits.gas.hash !== status.recentCommits.head.hash) {
      console.log(`💻 gas/ 最新コミット:  [${status.recentCommits.gas.hash}] ${status.recentCommits.gas.message}`);
    }

    if (status.claspStatus && status.claspStatus.filesToPush) {
      console.log(`📦 管理対象ファイル数: ${status.claspStatus.filesToPush.length} files`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (status.isDeployedMatch) {
      console.log('✅ 【最新】ローカル最新コミットの内容が GAS にデプロイされています。');
    } else {
      console.log('⚠️ 【要確認】ローカル最新コミットとデプロイのコミットハッシュが一致していません。');
      console.log('   最新コードを反映するには `npm run deploy` を実行してください。');
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
  getLocalRecentCommits,
  getClaspStatus,
  isHashMatch,
  checkStatus,
  main
};

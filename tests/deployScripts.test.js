const https = require('https');
const EventEmitter = require('events');

const {
  parseArgs,
  buildVersionDescription,
  parseVersionNumber,
  runSmokeTest,
  runDeployPipeline,
  DEFAULT_DEPLOYMENT_ID
} = require('../scripts/deploy');

const {
  checkStatus,
  getDeployments,
  getVersions,
  getUncommittedGasChanges,
  extractCommitHashFromDescription,
  getGasDiffSinceCommit
} = require('../scripts/deploy-status');

describe('scripts/deploy.js', () => {
  describe('parseArgs', () => {
    test('デフォルトオプションが正しく設定される', () => {
      const opts = parseArgs([]);
      expect(opts.skipVerify).toBe(false);
      expect(opts.skipTests).toBe(false);
      expect(opts.skipLint).toBe(false);
      expect(opts.skipSmokeTest).toBe(false);
      expect(opts.dryRun).toBe(false);
      expect(opts.deploymentId).toBe(DEFAULT_DEPLOYMENT_ID);
    });

    test('CLI オプションフラグが正しく反映される', () => {
      const opts = parseArgs([
        '--skip-verify',
        '--skip-smoke-test',
        '--dry-run',
        '--deployment-id',
        'custom-id'
      ]);
      expect(opts.skipVerify).toBe(true);
      expect(opts.skipSmokeTest).toBe(true);
      expect(opts.dryRun).toBe(true);
      expect(opts.deploymentId).toBe('custom-id');
    });

    test('後方互換フラグ (--skip-tests, --skip-lint, --skip-test, --skip-smoke) が正しく反映される', () => {
      const opts1 = parseArgs(['--skip-tests', '--skip-lint']);
      expect(opts1.skipVerify).toBe(true);
      expect(opts1.skipTests).toBe(true);
      expect(opts1.skipLint).toBe(true);

      const opts2 = parseArgs(['--skip-test', '--skip-smoke']);
      expect(opts2.skipVerify).toBe(true);
      expect(opts2.skipTests).toBe(true);
      expect(opts2.skipSmokeTest).toBe(true);
    });
  });

  describe('buildVersionDescription', () => {
    test('git コミット情報から正しく説明文を生成する', () => {
      const mockExec = jest.fn().mockReturnValue('35f727e - fix something\n');
      const desc = buildVersionDescription(mockExec);
      expect(desc).toBe('production update from main 35f727e - fix something');
      expect(mockExec).toHaveBeenCalled();
    });

    test('ブランチ名が取得できる場合はそのブランチ名が反映される', () => {
      const mockExec = jest.fn((cmd) => {
        if (cmd.includes('rev-parse --abbrev-ref')) return 'feat/my-branch\n';
        if (cmd.includes('git log')) return 'abc1234 - some commit\n';
        return '';
      });
      const desc = buildVersionDescription(mockExec);
      expect(desc).toBe('production update from feat/my-branch abc1234 - some commit');
    });

    test('説明文が 100 文字を超える場合は切り詰める', () => {
      const longMsg = 'a'.repeat(120);
      const mockExec = jest.fn().mockReturnValue(`abc1234 - ${longMsg}`);
      const desc = buildVersionDescription(mockExec);
      expect(desc.length).toBeLessThanOrEqual(100);
      expect(desc.endsWith('...')).toBe(true);
    });

    test('git 呼び出しが失敗した場合はフォールバック説明文を返す', () => {
      const mockExec = jest.fn().mockImplementation(() => {
        throw new Error('git not found');
      });
      const desc = buildVersionDescription(mockExec);
      expect(desc).toMatch(/^production update \d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('parseVersionNumber', () => {
    test('Created version <N> から数値を抽出する', () => {
      expect(parseVersionNumber('Created version 29')).toBe(29);
      expect(parseVersionNumber('Created version 105.')).toBe(105);
      expect(parseVersionNumber('Created version   42\n')).toBe(42);
    });

    test('マッチしない場合は null を返す', () => {
      expect(parseVersionNumber('Error: failed')).toBeNull();
      expect(parseVersionNumber(null)).toBeNull();
      expect(parseVersionNumber(123)).toBeNull();
    });
  });

  describe('runSmokeTest', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    function mockHttpsGetOnce({ statusCode, headers = {}, body = '', emitError = null, timeout = false }) {
      return jest.spyOn(https, 'get').mockImplementation((url, callback) => {
        const req = new EventEmitter();
        req.setTimeout = jest.fn((ms, cb) => {
          if (timeout) {
            process.nextTick(cb);
          }
          return req;
        });
        req.destroy = jest.fn();

        process.nextTick(() => {
          if (timeout) {
            return;
          }
          if (emitError) {
            req.emit('error', emitError);
            return;
          }
          const res = new EventEmitter();
          res.statusCode = statusCode;
          res.headers = headers;

          callback(res);

          if (body) {
            res.emit('data', body);
          }
          res.emit('end');
        });

        return req;
      });
    }

    test('maxRedirects が 0 以下の場合は Too many redirects エラーを返す', async () => {
      await expect(runSmokeTest('https://example.com', 1000, 0))
        .rejects.toThrow('Smoke test failed: Too many redirects');
    });

    test('無効な URL の場合は例外をスローする', async () => {
      await expect(runSmokeTest('not-a-valid-url', 1000, 5))
        .rejects.toThrow();
    });

    test('正常系 (HTTP 200 & ok:true & ready:true): 成功オブジェクトを返す', async () => {
      mockHttpsGetOnce({
        statusCode: 200,
        body: JSON.stringify({ ok: true, ready: true })
      });
      const res = await runSmokeTest('https://script.google.com/test');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ok: true, ready: true });
    });

    test('HTTP 4xx/5xx: レスポンスが JSON {ok:true, ready:true} であっても失敗として reject する', async () => {
      mockHttpsGetOnce({
        statusCode: 500,
        body: JSON.stringify({ ok: true, ready: true })
      });
      await expect(runSmokeTest('https://script.google.com/test'))
        .rejects.toThrow('Smoke test request failed with HTTP status 500');

      mockHttpsGetOnce({
        statusCode: 404,
        body: JSON.stringify({ ok: true, ready: true })
      });
      await expect(runSmokeTest('https://script.google.com/test'))
        .rejects.toThrow('Smoke test request failed with HTTP status 404');
    });

    test('HTTP 200 だが ready !== true の場合は reject する', async () => {
      mockHttpsGetOnce({
        statusCode: 200,
        body: JSON.stringify({ ok: true, ready: false })
      });
      await expect(runSmokeTest('https://script.google.com/test'))
        .rejects.toThrow('Ready check failed: unexpected JSON response');
    });

    test('HTTP 200 だが JSON パース不能の場合は reject する', async () => {
      mockHttpsGetOnce({
        statusCode: 200,
        body: '<html>Error Page</html>'
      });
      await expect(runSmokeTest('https://script.google.com/test'))
        .rejects.toThrow('Failed to parse response as JSON (status 200)');
    });

    test('302 リダイレクト: Location ヘッダーを追跡して最終結果を返す', async () => {
      let callCount = 0;
      jest.spyOn(https, 'get').mockImplementation((url, callback) => {
        const req = new EventEmitter();
        req.setTimeout = jest.fn();
        req.destroy = jest.fn();

        process.nextTick(() => {
          const res = new EventEmitter();
          if (callCount === 0) {
            callCount += 1;
            res.statusCode = 302;
            res.headers = { location: 'https://script.googleusercontent.com/exec' };
            callback(res);
            res.emit('end');
          } else {
            res.statusCode = 200;
            res.headers = {};
            callback(res);
            res.emit('data', JSON.stringify({ ok: true, ready: true }));
            res.emit('end');
          }
        });
        return req;
      });

      const res = await runSmokeTest('https://script.google.com/initial');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ok: true, ready: true });
    });

    test('302 リダイレクト: 不正な Location URL の場合は reject する', async () => {
      mockHttpsGetOnce({
        statusCode: 302,
        headers: { location: 'http://[invalid-ipv6' }
      });
      await expect(runSmokeTest('https://script.google.com/test'))
        .rejects.toThrow('Failed to parse redirect URL');
    });

    test('タイムアウト発生時は reject する', async () => {
      mockHttpsGetOnce({ timeout: true });
      await expect(runSmokeTest('https://script.google.com/test', 50))
        .rejects.toThrow('Smoke test request timed out after 50ms');
    });

    test('ネットワークエラー発生時は reject する', async () => {
      mockHttpsGetOnce({ emitError: new Error('ECONNRESET') });
      await expect(runSmokeTest('https://script.google.com/test'))
        .rejects.toThrow('ECONNRESET');
    });
  });

  describe('runDeployPipeline', () => {
    let mockExecFn;
    let mockExecFileFn;
    let mockSmokeTestFn;
    let mockLogFn;
    let mockErrFn;

    beforeEach(() => {
      mockExecFn = jest.fn();
      mockExecFileFn = jest.fn();
      mockSmokeTestFn = jest.fn().mockResolvedValue({ statusCode: 200, body: { ok: true, ready: true } });
      mockLogFn = jest.fn();
      mockErrFn = jest.fn();
    });

    test('正常系: Verify、Push、Version、Redeploy、SmokeTest が順序通り呼び出される', async () => {
      // version 作成の出力をモック
      mockExecFileFn.mockImplementation((cmd, args) => {
        if (cmd === 'clasp' && args[0] === 'version') {
          return 'Created version 30';
        }
        if (cmd === 'clasp' && args[0] === 'redeploy') {
          return 'Redeployed dep-1 @30';
        }
        return '';
      });
      // git log の出力をモック
      mockExecFn.mockReturnValue('abcdef1 - fix something');

      const options = {
        skipVerify: false,
        skipSmokeTest: false,
        dryRun: false,
        deploymentId: 'dep-1'
      };

      const result = await runDeployPipeline(options, {
        execFn: mockExecFn,
        execFileFn: mockExecFileFn,
        smokeTestFn: mockSmokeTestFn,
        logFn: mockLogFn,
        errFn: mockErrFn
      });

      expect(result.success).toBe(true);
      expect(result.versionNumber).toBe(30);

      // 呼び出し順序と引数の検証
      // 1. npm run verify
      expect(mockExecFn).toHaveBeenNthCalledWith(1, 'npm run verify', expect.objectContaining({ stdio: 'inherit' }));
      // 2. clasp push --force
      expect(mockExecFileFn).toHaveBeenNthCalledWith(1, 'clasp', ['push', '--force'], expect.any(Object));
      // 3. clasp version
      expect(mockExecFileFn).toHaveBeenNthCalledWith(2, 'clasp', ['version', expect.any(String)], expect.any(Object));
      // 4. clasp redeploy
      expect(mockExecFileFn).toHaveBeenNthCalledWith(
        3,
        'clasp',
        ['redeploy', 'dep-1', '-V', '30', '-d', expect.stringContaining('@30')],
        expect.any(Object)
      );
      // 5. smoke test
      expect(mockSmokeTestFn).toHaveBeenCalledWith('https://script.google.com/macros/s/dep-1/exec');

      // 全 5 ステップの進捗ログが出力されていること
      expect(mockLogFn).toHaveBeenCalledWith(expect.stringContaining('[Step 1/5]'));
      expect(mockLogFn).toHaveBeenCalledWith(expect.stringContaining('[Step 2/5]'));
      expect(mockLogFn).toHaveBeenCalledWith(expect.stringContaining('[Step 3/5]'));
      expect(mockLogFn).toHaveBeenCalledWith(expect.stringContaining('[Step 4/5]'));
      expect(mockLogFn).toHaveBeenCalledWith(expect.stringContaining('[Step 5/5]'));
    });

    test('--dry-run モード: Verify は実行されるが、変更系コマンド (push/version/redeploy/smokeTest) は一切実行されない', async () => {
      const options = {
        skipVerify: false,
        skipSmokeTest: false,
        dryRun: true,
        deploymentId: 'dep-1'
      };

      const result = await runDeployPipeline(options, {
        execFn: mockExecFn,
        execFileFn: mockExecFileFn,
        smokeTestFn: mockSmokeTestFn,
        logFn: mockLogFn,
        errFn: mockErrFn
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.versionNumber).toBeNull(); // 999 などの架空の番号が入っていないこと

      // npm run verify は呼ばれる
      expect(mockExecFn).toHaveBeenCalledWith('npm run verify', expect.any(Object));

      // clasp コマンドと smokeTest は一切呼ばれない！
      expect(mockExecFileFn).not.toHaveBeenCalled();
      expect(mockSmokeTestFn).not.toHaveBeenCalled();
    });

    test('npm run verify 失敗時: 即座に例外がスローされ、後続の Push / Version は実行されない', async () => {
      mockExecFn.mockImplementation((cmd) => {
        if (cmd === 'npm run verify') throw new Error('Verification failed');
        return '';
      });

      const options = {
        skipVerify: false,
        skipSmokeTest: false,
        dryRun: false,
        deploymentId: 'dep-1'
      };

      await expect(runDeployPipeline(options, {
        execFn: mockExecFn,
        execFileFn: mockExecFileFn,
        smokeTestFn: mockSmokeTestFn,
        logFn: mockLogFn,
        errFn: mockErrFn
      })).rejects.toThrow('Verification failed');

      expect(mockExecFileFn).not.toHaveBeenCalled();
      expect(mockSmokeTestFn).not.toHaveBeenCalled();
    });

    test('--skip-verify 指定時: Verify は実行されずにスキップされる', async () => {
      mockExecFileFn.mockImplementation((cmd, args) => {
        if (cmd === 'clasp' && args[0] === 'version') return 'Created version 30';
        return '';
      });

      const options = {
        skipVerify: true,
        skipSmokeTest: true,
        dryRun: false,
        deploymentId: 'dep-1'
      };

      await runDeployPipeline(options, {
        execFn: mockExecFn,
        execFileFn: mockExecFileFn,
        smokeTestFn: mockSmokeTestFn,
        logFn: mockLogFn,
        errFn: mockErrFn
      });

      expect(mockExecFn).not.toHaveBeenCalledWith('npm run verify', expect.any(Object));
      expect(mockLogFn).toHaveBeenCalledWith(expect.stringContaining('事前検証をスキップしました'));
    });

    test('clasp push 失敗時: 例外がスローされ、バージョン作成やデプロイ更新は実行されない', async () => {
      mockExecFileFn.mockImplementation((cmd, args) => {
        if (cmd === 'clasp' && args[0] === 'push') {
          throw new Error('Network timeout during push');
        }
        return '';
      });

      const options = {
        skipTests: true,
        skipLint: true,
        skipSmokeTest: false,
        dryRun: false,
        deploymentId: 'dep-1'
      };

      await expect(runDeployPipeline(options, {
        execFn: mockExecFn,
        execFileFn: mockExecFileFn,
        smokeTestFn: mockSmokeTestFn,
        logFn: mockLogFn,
        errFn: mockErrFn
      })).rejects.toThrow('Network timeout during push');

      expect(mockExecFileFn).toHaveBeenCalledTimes(1); // push のみ
      expect(mockSmokeTestFn).not.toHaveBeenCalled();
    });

    test('clasp version 失敗時 (バージョン番号パース不能): 例外がスローされ、redeploy は実行されない', async () => {
      mockExecFileFn.mockImplementation((cmd, args) => {
        if (cmd === 'clasp' && args[0] === 'version') {
          return 'Unexpected output without version number';
        }
        return '';
      });

      const options = {
        skipTests: true,
        skipLint: true,
        skipSmokeTest: false,
        dryRun: false,
        deploymentId: 'dep-1'
      };

      await expect(runDeployPipeline(options, {
        execFn: mockExecFn,
        execFileFn: mockExecFileFn,
        smokeTestFn: mockSmokeTestFn,
        logFn: mockLogFn,
        errFn: mockErrFn
      })).rejects.toThrow('スクリプトバージョン番号の取得に失敗しました');

      // redeploy は呼ばれない (push と version の 2 回のみ)
      expect(mockExecFileFn).toHaveBeenCalledTimes(2);
      expect(mockSmokeTestFn).not.toHaveBeenCalled();
    });

    test('smokeTest 失敗時: エラーがログ出力され、例外がスローされる', async () => {
      mockExecFileFn.mockImplementation((cmd, args) => {
        if (cmd === 'clasp' && args[0] === 'version') return 'Created version 30';
        return '';
      });
      mockSmokeTestFn.mockRejectedValue(new Error('Connection refused'));

      const options = {
        skipTests: true,
        skipLint: true,
        skipSmokeTest: false,
        dryRun: false,
        deploymentId: 'dep-1'
      };

      await expect(runDeployPipeline(options, {
        execFn: mockExecFn,
        execFileFn: mockExecFileFn,
        smokeTestFn: mockSmokeTestFn,
        logFn: mockLogFn,
        errFn: mockErrFn
      })).rejects.toThrow('デプロイ後のスモークテストに失敗しました');

      expect(mockErrFn).toHaveBeenCalledWith(expect.stringContaining('Connection refused'));
    });
  });
});

describe('scripts/deploy-status.js', () => {
  describe('getDeployments', () => {
    test('clasp deployments --json の出力をパースして配列を返す', () => {
      const mockExec = jest.fn().mockReturnValue(JSON.stringify([{ deploymentId: 'dep-1' }]));
      expect(getDeployments(mockExec)).toEqual([{ deploymentId: 'dep-1' }]);
    });

    test('例外発生時は Error をスローする', () => {
      const mockExec = jest.fn().mockImplementation(() => { throw new Error('clasp not found'); });
      expect(() => getDeployments(mockExec)).toThrow('clasp deployments の取得に失敗しました');
    });
  });

  describe('getVersions', () => {
    test('clasp versions --json の出力をパースして配列を返す', () => {
      const mockExec = jest.fn().mockReturnValue(JSON.stringify([{ versionNumber: 1 }]));
      expect(getVersions(mockExec)).toEqual([{ versionNumber: 1 }]);
    });

    test('例外発生時は null を返す', () => {
      const mockExec = jest.fn().mockImplementation(() => { throw new Error('clasp error'); });
      expect(getVersions(mockExec)).toBeNull();
    });
  });

  describe('extractCommitHashFromDescription', () => {
    test('標準的なバージョン説明文からコミットハッシュを抽出できる', () => {
      expect(extractCommitHashFromDescription('production update from main 35f727e - fix something')).toBe('35f727e');
      expect(extractCommitHashFromDescription('production update @29 - production update from main c9dbbbc - feat')).toBe('c9dbbbc');
      expect(extractCommitHashFromDescription('[35f727e] merge pull request')).toBe('35f727e');
    });

    test('トピックブランチからの説明文でもコミットハッシュを抽出できる', () => {
      expect(extractCommitHashFromDescription('production update from feat/sensor 35f727e - fix')).toBe('35f727e');
      expect(extractCommitHashFromDescription('production update from task/deploy-scripts a1b2c3d - add tests')).toBe('a1b2c3d');
    });

    test('ハッシュが存在しない場合は null を返す', () => {
      expect(extractCommitHashFromDescription('production web app v3')).toBeNull();
      expect(extractCommitHashFromDescription('')).toBeNull();
      expect(extractCommitHashFromDescription(null)).toBeNull();
    });
  });

  describe('getUncommittedGasChanges', () => {
    test('未コミットの gas/ ファイル一覧を配列で返す', () => {
      const mockExec = jest.fn().mockReturnValue(' M gas/Ingest.gs\n?? gas/NewFile.gs\n');
      const result = getUncommittedGasChanges(mockExec);
      expect(result).toEqual(['M gas/Ingest.gs', '?? gas/NewFile.gs']);
    });

    test('未コミット変更がない場合は空配列を返す', () => {
      const mockExec = jest.fn().mockReturnValue('');
      const result = getUncommittedGasChanges(mockExec);
      expect(result).toEqual([]);
    });

    test('例外発生時は null を返す', () => {
      const mockExec = jest.fn().mockImplementation(() => { throw new Error('git error'); });
      expect(getUncommittedGasChanges(mockExec)).toBeNull();
    });
  });

  describe('getGasDiffSinceCommit', () => {
    test('指定コミットから現在までの差分ファイル一覧を返す', () => {
      const mockExec = jest.fn((cmd) => {
        if (cmd.includes('rev-parse')) return '';
        if (cmd.includes('diff')) return 'gas/Ingest.gs\ngas/Router.gs\n';
        return '';
      });
      const diff = getGasDiffSinceCommit('35f727e', mockExec);
      expect(diff).toEqual(['gas/Ingest.gs', 'gas/Router.gs']);
    });

    test('差分がない場合は空配列を返す', () => {
      const mockExec = jest.fn((cmd) => {
        if (cmd.includes('rev-parse')) return '';
        if (cmd.includes('diff')) return '';
        return '';
      });
      const diff = getGasDiffSinceCommit('35f727e', mockExec);
      expect(diff).toEqual([]);
    });

    test('コミットが Git 履歴に存在しない場合は null を返す', () => {
      const mockExec = jest.fn().mockImplementation(() => {
        throw new Error('fatal: Needed a single revision');
      });
      expect(getGasDiffSinceCommit('badhash123', mockExec)).toBeNull();
    });
  });

  describe('checkStatus 境界条件テスト', () => {
    const defaultDeployments = [
      {
        deploymentId: DEFAULT_DEPLOYMENT_ID,
        versionNumber: 29,
        description: 'production update @29 - production update from main 35f727e'
      }
    ];
    const defaultVersions = [
      {
        versionNumber: 29,
        description: 'production update from main 35f727e - archive pointer'
      }
    ];

    test('境界条件 1: UP_TO_DATE (デプロイ後 gas/ の差分 0 件かつ未コミット変更なし)', () => {
      const mockExec = jest.fn((cmd) => {
        if (cmd.includes('deployments')) return JSON.stringify(defaultDeployments);
        if (cmd.includes('versions')) return JSON.stringify(defaultVersions);
        if (cmd.includes('status --porcelain')) return ''; // 未コミット変更なし
        if (cmd.includes('rev-parse')) return ''; // コミット存在
        if (cmd.includes('diff --name-only')) return ''; // gas/ の差分なし
        return '';
      });

      const status = checkStatus(DEFAULT_DEPLOYMENT_ID, mockExec);
      expect(status.isDeployedMatch).toBe(true);
      expect(status.statusReason).toBe('UP_TO_DATE');
      expect(status.deployedHash).toBe('35f727e');
      expect(status.diffFiles).toEqual([]);
      expect(status.uncommittedFiles).toEqual([]);
    });

    test('境界条件 2: UNCOMMITTED_CHANGES (ローカルの gas/ に未コミット変更がある場合は未反映と判定)', () => {
      const mockExec = jest.fn((cmd) => {
        if (cmd.includes('deployments')) return JSON.stringify(defaultDeployments);
        if (cmd.includes('versions')) return JSON.stringify(defaultVersions);
        if (cmd.includes('status --porcelain')) return ' M gas/Ingest.gs\n'; // 未コミット変更あり！
        if (cmd.includes('rev-parse')) return '';
        if (cmd.includes('diff --name-only')) return '';
        return '';
      });

      const status = checkStatus(DEFAULT_DEPLOYMENT_ID, mockExec);
      expect(status.isDeployedMatch).toBe(false);
      expect(status.statusReason).toBe('UNCOMMITTED_CHANGES');
      expect(status.uncommittedFiles).toHaveLength(1);
    });

    test('境界条件 3: DIFF_DETECTED (デプロイコミット以降に gas/ 変更コミットがある場合は未反映と判定)', () => {
      const mockExec = jest.fn((cmd) => {
        if (cmd.includes('deployments')) return JSON.stringify(defaultDeployments);
        if (cmd.includes('versions')) return JSON.stringify(defaultVersions);
        if (cmd.includes('status --porcelain')) return '';
        if (cmd.includes('rev-parse')) return '';
        if (cmd.includes('diff --name-only')) return 'gas/DataArchive.gs\n'; // 差分あり！
        return '';
      });

      const status = checkStatus(DEFAULT_DEPLOYMENT_ID, mockExec);
      expect(status.isDeployedMatch).toBe(false);
      expect(status.statusReason).toBe('DIFF_DETECTED');
      expect(status.diffFiles).toEqual(['gas/DataArchive.gs']);
    });

    test('境界条件 4: NO_COMMIT_HASH_IN_DEPLOYMENT (手動デプロイ等で両方にハッシュがない場合)', () => {
      const mockExec = jest.fn((cmd) => {
        if (cmd.includes('deployments')) {
          return JSON.stringify([
            { deploymentId: DEFAULT_DEPLOYMENT_ID, versionNumber: 5, description: 'production web app' }
          ]);
        }
        if (cmd.includes('versions')) {
          return JSON.stringify([
            { versionNumber: 5, description: 'production web app' }
          ]);
        }
        if (cmd.includes('status --porcelain')) return '';
        return '';
      });

      const status = checkStatus(DEFAULT_DEPLOYMENT_ID, mockExec);
      expect(status.isDeployedMatch).toBe(false);
      expect(status.statusReason).toBe('NO_COMMIT_HASH_IN_DEPLOYMENT');
      expect(status.deployedHash).toBeNull();
    });

    test('境界条件 5: COMMIT_NOT_FOUND (説明文のハッシュがローカル Git 履歴にない場合)', () => {
      const mockExec = jest.fn((cmd) => {
        if (cmd.includes('deployments')) return JSON.stringify(defaultDeployments);
        if (cmd.includes('versions')) return JSON.stringify(defaultVersions);
        if (cmd.includes('status --porcelain')) return '';
        if (cmd.includes('rev-parse')) {
          throw new Error('fatal: Not a valid object name');
        }
        return '';
      });

      const status = checkStatus(DEFAULT_DEPLOYMENT_ID, mockExec);
      expect(status.isDeployedMatch).toBe(false);
      expect(status.statusReason).toBe('COMMIT_NOT_FOUND');
      expect(status.diffFiles).toBeNull();
    });

    test('境界条件 6: DEPLOYMENT_NOT_FOUND (指定デプロイ ID が見つからない場合)', () => {
      const mockExec = jest.fn((cmd) => {
        if (cmd.includes('deployments')) return JSON.stringify([]);
        if (cmd.includes('versions')) return JSON.stringify([]);
        if (cmd.includes('status --porcelain')) return '';
        return '';
      });

      const status = checkStatus('unknown-deployment-id', mockExec);
      expect(status.isDeployedMatch).toBe(false);
      expect(status.statusReason).toBe('DEPLOYMENT_NOT_FOUND');
      expect(status.deployment).toBeNull();
    });

    test('境界条件 7: description fallback - versionDetail にハッシュがなく deployment description にハッシュがある場合', () => {
      const mockExec = jest.fn((cmd) => {
        if (cmd.includes('deployments')) {
          return JSON.stringify([
            {
              deploymentId: DEFAULT_DEPLOYMENT_ID,
              versionNumber: 29,
              description: 'production update @29 - production update from main 35f727e'
            }
          ]);
        }
        if (cmd.includes('versions')) {
          return JSON.stringify([
            {
              versionNumber: 29,
              description: 'v1.0 release with no hash'
            }
          ]);
        }
        if (cmd.includes('status --porcelain')) return '';
        if (cmd.includes('rev-parse')) return '';
        if (cmd.includes('diff --name-only')) return '';
        return '';
      });

      const status = checkStatus(DEFAULT_DEPLOYMENT_ID, mockExec);
      expect(status.isDeployedMatch).toBe(true);
      expect(status.statusReason).toBe('UP_TO_DATE');
      expect(status.deployedHash).toBe('35f727e');
    });

    test('境界条件 8: description fallback - versionDetail にハッシュがある場合は versionDetail のハッシュが優先される', () => {
      const mockExec = jest.fn((cmd) => {
        if (cmd.includes('deployments')) {
          return JSON.stringify([
            {
              deploymentId: DEFAULT_DEPLOYMENT_ID,
              versionNumber: 29,
              description: 'production update @29 - production update from main 1111111'
            }
          ]);
        }
        if (cmd.includes('versions')) {
          return JSON.stringify([
            {
              versionNumber: 29,
              description: 'production update from main 2222222 - latest'
            }
          ]);
        }
        if (cmd.includes('status --porcelain')) return '';
        if (cmd.includes('rev-parse')) return '';
        if (cmd.includes('diff --name-only')) return '';
        return '';
      });

      const status = checkStatus(DEFAULT_DEPLOYMENT_ID, mockExec);
      expect(status.deployedHash).toBe('2222222');
    });

    test('境界条件 9: COMMAND_FAILED (git status コマンド失敗時は COMMAND_FAILED となり UP_TO_DATE と誤認しない)', () => {
      const mockExec = jest.fn((cmd) => {
        if (cmd.includes('deployments')) return JSON.stringify(defaultDeployments);
        if (cmd.includes('versions')) return JSON.stringify(defaultVersions);
        if (cmd.includes('status --porcelain')) {
          throw new Error('git status failed');
        }
        return '';
      });

      const status = checkStatus(DEFAULT_DEPLOYMENT_ID, mockExec);
      expect(status.isDeployedMatch).toBe(false);
      expect(status.statusReason).toBe('COMMAND_FAILED');
    });

    test('境界条件 10: COMMAND_FAILED (clasp versions コマンド失敗時は COMMAND_FAILED となり UP_TO_DATE と誤認しない)', () => {
      const mockExec = jest.fn((cmd) => {
        if (cmd.includes('deployments')) return JSON.stringify(defaultDeployments);
        if (cmd.includes('versions')) {
          throw new Error('clasp versions network timeout');
        }
        if (cmd.includes('status --porcelain')) return '';
        return '';
      });

      const status = checkStatus(DEFAULT_DEPLOYMENT_ID, mockExec);
      expect(status.isDeployedMatch).toBe(false);
      expect(status.statusReason).toBe('COMMAND_FAILED');
    });

    test('境界条件 11: COMMAND_FAILED (clasp deployments コマンド失敗時は COMMAND_FAILED となり UP_TO_DATE と誤認しない)', () => {
      const mockExec = jest.fn((cmd) => {
        if (cmd.includes('deployments')) {
          throw new Error('clasp deployments network timeout');
        }
        return '';
      });

      const status = checkStatus(DEFAULT_DEPLOYMENT_ID, mockExec);
      expect(status.isDeployedMatch).toBe(false);
      expect(status.statusReason).toBe('COMMAND_FAILED');
    });
  });
});

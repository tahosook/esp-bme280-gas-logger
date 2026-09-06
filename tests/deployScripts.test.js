const {
  parseArgs,
  buildVersionDescription,
  parseVersionNumber,
  DEFAULT_DEPLOYMENT_ID
} = require('../scripts/deploy');

const {
  checkStatus,
  getDeployments,
  getVersions,
  getLocalRecentCommits,
  getClaspStatus
} = require('../scripts/deploy-status');

describe('scripts/deploy.js', () => {
  describe('parseArgs', () => {
    test('デフォルトオプションが正しく設定される', () => {
      const opts = parseArgs([]);
      expect(opts.skipTests).toBe(false);
      expect(opts.skipLint).toBe(false);
      expect(opts.skipSmokeTest).toBe(false);
      expect(opts.dryRun).toBe(false);
      expect(opts.deploymentId).toBe(DEFAULT_DEPLOYMENT_ID);
    });

    test('CLI オプションフラグが正しく反映される', () => {
      const opts = parseArgs([
        '--skip-tests',
        '--skip-lint',
        '--skip-smoke-test',
        '--dry-run',
        '--deployment-id',
        'custom-id'
      ]);
      expect(opts.skipTests).toBe(true);
      expect(opts.skipLint).toBe(true);
      expect(opts.skipSmokeTest).toBe(true);
      expect(opts.dryRun).toBe(true);
      expect(opts.deploymentId).toBe('custom-id');
    });

    test('エイリアスフラグ (--skip-test, --skip-smoke) が正しく反映される', () => {
      const opts = parseArgs(['--skip-test', '--skip-smoke']);
      expect(opts.skipTests).toBe(true);
      expect(opts.skipSmokeTest).toBe(true);
    });
  });

  describe('buildVersionDescription', () => {
    test('git コミット情報から正しく説明文を生成する', () => {
      const mockExec = jest.fn().mockReturnValue('35f727e - fix something\n');
      const desc = buildVersionDescription(mockExec);
      expect(desc).toBe('production update from main 35f727e - fix something');
      expect(mockExec).toHaveBeenCalled();
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
});

describe('scripts/deploy-status.js', () => {
  describe('getDeployments', () => {
    test('clasp deployments の JSON 出力をパースする', () => {
      const mockOutput = JSON.stringify([
        { deploymentId: 'dep-1', versionNumber: 29, description: 'desc' }
      ]);
      const mockExec = jest.fn().mockReturnValue(mockOutput);
      const result = getDeployments(mockExec);
      expect(result).toHaveLength(1);
      expect(result[0].versionNumber).toBe(29);
    });

    test('エラー時は例外をスローする', () => {
      const mockExec = jest.fn().mockImplementation(() => {
        throw new Error('clasp error');
      });
      expect(() => getDeployments(mockExec)).toThrow('clasp deployments の取得に失敗しました');
    });
  });

  describe('getVersions', () => {
    test('clasp versions の JSON 出力をパースする', () => {
      const mockOutput = JSON.stringify([
        { versionNumber: 29, description: 'update desc' }
      ]);
      const mockExec = jest.fn().mockReturnValue(mockOutput);
      const result = getVersions(mockExec);
      expect(result).toHaveLength(1);
      expect(result[0].versionNumber).toBe(29);
    });

    test('エラー時は空配列を返す', () => {
      const mockExec = jest.fn().mockImplementation(() => {
        throw new Error('versions error');
      });
      expect(getVersions(mockExec)).toEqual([]);
    });
  });

  describe('getLocalRecentCommits', () => {
    test('git log から最新コミット情報を取得する', () => {
      const mockExec = jest.fn()
        .mockReturnValueOnce('35f727e\n')
        .mockReturnValueOnce('merge PR 52\n')
        .mockReturnValueOnce('384b8a3\n')
        .mockReturnValueOnce('fix archive pointer\n');
      const result = getLocalRecentCommits(mockExec);
      expect(result.head.hash).toBe('35f727e');
      expect(result.head.message).toBe('merge PR 52');
      expect(result.gas.hash).toBe('384b8a3');
      expect(result.gas.message).toBe('fix archive pointer');
    });

    test('例外発生時は unknown を返す', () => {
      const mockExec = jest.fn().mockImplementation(() => {
        throw new Error('fail');
      });
      const result = getLocalRecentCommits(mockExec);
      expect(result.head.hash).toBe('unknown');
      expect(result.gas.hash).toBe('unknown');
    });
  });

  describe('getClaspStatus', () => {
    test('clasp status --json をパースする', () => {
      const mockOutput = JSON.stringify({ filesToPush: ['a.gs'] });
      const mockExec = jest.fn().mockReturnValue(mockOutput);
      const result = getClaspStatus(mockExec);
      expect(result.filesToPush).toEqual(['a.gs']);
    });

    test('失敗時は null を返す', () => {
      const mockExec = jest.fn().mockImplementation(() => {
        throw new Error('fail');
      });
      expect(getClaspStatus(mockExec)).toBeNull();
    });
  });

  describe('checkStatus', () => {
    test('HEAD コミットがバージョンの description に含まれる場合に isDeployedMatch が true になる', () => {
      const mockExec = jest.fn((cmd) => {
        if (cmd.includes('deployments')) {
          return JSON.stringify([
            {
              deploymentId: DEFAULT_DEPLOYMENT_ID,
              versionNumber: 29,
              description: 'production update - latest version 29'
            }
          ]);
        }
        if (cmd.includes('versions')) {
          return JSON.stringify([
            {
              versionNumber: 29,
              description: 'production update from main 35f727e - archive pointer'
            }
          ]);
        }
        if (cmd.includes('gas/')) return '384b8a3\n';
        if (cmd.includes('git log')) return '35f727e\n';
        if (cmd.includes('clasp status')) return JSON.stringify({ filesToPush: [] });
        return '';
      });

      const status = checkStatus(DEFAULT_DEPLOYMENT_ID, mockExec);
      expect(status.isDeployedMatch).toBe(true);
      expect(status.deployment.versionNumber).toBe(29);
      expect(status.versionDetail.versionNumber).toBe(29);
    });

    test('コミットハッシュが一致しない場合は isDeployedMatch が false になる', () => {
      const mockExec = jest.fn((cmd) => {
        if (cmd.includes('deployments')) {
          return JSON.stringify([
            {
              deploymentId: DEFAULT_DEPLOYMENT_ID,
              versionNumber: 28,
              description: 'old deploy 1111111'
            }
          ]);
        }
        if (cmd.includes('versions')) {
          return JSON.stringify([
            { versionNumber: 28, description: 'old version' }
          ]);
        }
        if (cmd.includes('gas/')) return '384b8a3\n';
        if (cmd.includes('git log')) return '35f727e\n';
        return '';
      });

      const status = checkStatus(DEFAULT_DEPLOYMENT_ID, mockExec);
      expect(status.isDeployedMatch).toBe(false);
    });
  });
});

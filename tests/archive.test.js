const { runDataArchive_, getArchiveThresholdDate_, groupDataForArchive_, updateDailyLastRowAfterPurge_ } = require('../gas/DataArchive.gs');

describe('Data Archive Logic', () => {
  describe('getArchiveThresholdDate_', () => {
    it('should correctly calculate threshold date for standard months', () => {
      // Execution on 2026-09-01 01:00 JST (UTC 2026-08-31 16:00)
      const now = new Date(Date.UTC(2026, 7, 31, 16, 0, 0)); // 7 is August, 31 is Aug 31
      const threshold = getArchiveThresholdDate_(now, 2);

      // Expected: Aug 1 00:00 JST (UTC 2026-07-31 15:00:00)
      expect(threshold.getTime()).toBe(Date.UTC(2026, 6, 31, 15, 0, 0)); // 6 is July, 31 is Jul 31
    });

    it('should handle year rollover correctly', () => {
      // Execution on 2026-01-01 01:00 JST (UTC 2025-12-31 16:00)
      const now = new Date(Date.UTC(2025, 11, 31, 16, 0, 0));
      const threshold = getArchiveThresholdDate_(now, 2);

      // Expected: Dec 1 00:00 JST (UTC 2025-11-30 15:00:00)
      expect(threshold.getTime()).toBe(Date.UTC(2025, 10, 30, 15, 0, 0));
    });
  });

  describe('groupDataForArchive_', () => {
    it('should group correctly and stop when reaching threshold', () => {
      // Mock global for formatYearMonthTokyo_ (used if available)
      global.formatYearMonthTokyo_ = (d) => {
        const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
        return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}`;
      };

      const threshold = new Date(Date.UTC(2026, 6, 31, 15, 0, 0)); // 2026-08-01 00:00 JST

      const values = [
        [new Date(Date.UTC(2026, 4, 15, 10, 0, 0)), 25, 1010, 50, ''],   // 2026-05
        [new Date(Date.UTC(2026, 5, 10, 10, 0, 0)), 26, 1010, 50, ''],   // 2026-06
        [new Date(Date.UTC(2026, 5, 25, 10, 0, 0)), 27, 1010, 50, ''],   // 2026-06
        [new Date(Date.UTC(2026, 6, 15, 10, 0, 0)), 28, 1010, 50, ''],   // 2026-07
        [new Date(Date.UTC(2026, 7, 5, 10, 0, 0)), 30, 1010, 50, '']     // 2026-08 (should be skipped)
      ];

      const grouped = groupDataForArchive_(values, threshold);

      expect(grouped.size).toBe(3);
      expect(grouped.get('2026-05').length).toBe(1);
      expect(grouped.get('2026-06').length).toBe(2);
      expect(grouped.get('2026-07').length).toBe(1);
      expect(grouped.has('2026-08')).toBe(false);

      delete global.formatYearMonthTokyo_;
    });

    it('should stop and not archive when invalid or missing dates break continuity at the beginning', () => {
      const threshold = new Date(Date.UTC(2026, 6, 31, 15, 0, 0)); // 2026-08-01 00:00 JST
      const values = [
        ['invalid_date', 0, 0, 0],
        [null, 0, 0, 0],
        ['2026-06-01T00:00:00Z', 26, 1010, 50, '']
      ];

      const grouped = groupDataForArchive_(values, threshold);
      expect(grouped.size).toBe(0);
    });

    it('should parse valid string dates when continuous from beginning', () => {
      const threshold = new Date(Date.UTC(2026, 6, 31, 15, 0, 0)); // 2026-08-01 00:00 JST
      const values = [
        ['2026-06-01T00:00:00Z', 26, 1010, 50, '']
      ];

      const grouped = groupDataForArchive_(values, threshold);
      expect(grouped.size).toBe(1);
      expect(grouped.get('2026-06').length).toBe(1);
    });
  });

  describe('runDataArchive_', () => {
    let mockSpreadsheet;
    let mockSourceSheet;
    let mockTargetSheet;

    beforeEach(() => {
      mockTargetSheet = {
        getLastRow: jest.fn().mockReturnValue(0),
        getRange: jest.fn().mockImplementation((r, c, numRows) => ({
          setValues: jest.fn(),
          getValues: jest.fn().mockReturnValue(Array(numRows).fill([1]))
        })),
        appendRow: jest.fn()
      };

      mockSourceSheet = {
        getLastRow: jest.fn().mockReturnValue(4),
        getLastColumn: jest.fn().mockReturnValue(5),
        getRange: jest.fn().mockReturnValue({
          getValues: jest.fn().mockReturnValue([
            [new Date(Date.UTC(2026, 4, 15, 10, 0, 0)), 25, 1010, 50, ''],
            [new Date(Date.UTC(2026, 5, 10, 10, 0, 0)), 26, 1010, 50, ''],
            [new Date(Date.UTC(2026, 5, 25, 10, 0, 0)), 27, 1010, 50, '']
          ])
        }),
        deleteRows: jest.fn()
      };

      mockSpreadsheet = {
        getSheetByName: jest.fn().mockReturnValue(null),
        insertSheet: jest.fn().mockReturnValue(mockTargetSheet),
        getActiveSheet: jest.fn().mockReturnValue(mockSourceSheet)
      };

      global.PropertiesService = {
        getScriptProperties: jest.fn().mockReturnValue({
          getProperty: jest.fn().mockImplementation((key) => {
            if (key === 'SPREADSHEET_ID') return 'mock_id';
            if (key === 'SHEET_NAME') return 'RawData';
            return null;
          }),
          getProperties: jest.fn().mockReturnValue({
            SPREADSHEET_ID: 'mock_id',
            SHEET_NAME: 'RawData'
          })
        })
      };

      global.SpreadsheetApp = {
        openById: jest.fn().mockReturnValue(mockSpreadsheet)
      };

      global.SCRIPT_PROPERTY_KEYS = {
        spreadsheetId: 'SPREADSHEET_ID',
        sheetName: 'SHEET_NAME'
      };

      global.getRawDataSheet_ = jest.fn().mockReturnValue(mockSourceSheet);
    });

    it('should archive and purge correctly', () => {
      const result = runDataArchive_();
      expect(result.status).toBe('success');
      expect(result.archivedRows).toBe(3);
      expect(mockSourceSheet.deleteRows).toHaveBeenCalledWith(2, 3);
      expect(mockSpreadsheet.insertSheet).toHaveBeenCalled();
    });

    it('Test 1: should archive 3 old rows, delete only 3 rows, keep 2 new rows, and decrement DAILY_LAST_ROW by 3', () => {
      // 古いデータ3行、新しいデータ2行
      const values = [
        [new Date(Date.UTC(2026, 4, 15, 10, 0, 0)), 25, 1010, 50, ''], // 2026-05 (古い)
        [new Date(Date.UTC(2026, 5, 10, 10, 0, 0)), 26, 1010, 50, ''], // 2026-06 (古い)
        [new Date(Date.UTC(2026, 5, 25, 10, 0, 0)), 27, 1010, 50, ''], // 2026-06 (古い)
        [new Date(Date.UTC(2026, 7, 5, 10, 0, 0)), 28, 1010, 50, ''],  // 2026-08 (新しい)
        [new Date(Date.UTC(2026, 7, 6, 10, 0, 0)), 29, 1010, 50, '']   // 2026-08 (新しい)
      ];

      mockSourceSheet.getLastRow = jest.fn().mockReturnValue(6); // ヘッダー + 5行
      mockSourceSheet.getRange = jest.fn().mockReturnValue({
        getValues: jest.fn().mockReturnValue(values)
      });

      const propMap = new Map([
        ['SPREADSHEET_ID', 'mock_id'],
        ['SHEET_NAME', 'RawData'],
        ['DAILY_LAST_ROW', '10']
      ]);
      global.PropertiesService.getScriptProperties = jest.fn().mockReturnValue({
        getProperty: jest.fn().mockImplementation((k) => propMap.get(k) || null),
        setProperty: jest.fn().mockImplementation((k, v) => propMap.set(k, String(v))),
        getProperties: jest.fn().mockReturnValue(Object.fromEntries(propMap))
      });

      const result = runDataArchive_();
      expect(result.status).toBe('success');
      expect(result.archivedRows).toBe(3); // 古い3行だけarchive
      expect(mockSourceSheet.deleteRows).toHaveBeenCalledWith(2, 3); // 古い3行だけ削除（新しい2行は残る）
      expect(propMap.get('DAILY_LAST_ROW')).toBe('7'); // DAILY_LAST_ROW も 10 - 3 = 7
    });

    it('Test 2: should stop at first newer data and never delete newer rows when order is broken (古い、古い、新しい、古い)', () => {
      // 古い、古い、新しい、古い
      const values = [
        [new Date(Date.UTC(2026, 4, 15, 10, 0, 0)), 25, 1010, 50, ''], // Row 2: 2026-05 (古い)
        [new Date(Date.UTC(2026, 5, 10, 10, 0, 0)), 26, 1010, 50, ''], // Row 3: 2026-06 (古い)
        [new Date(Date.UTC(2026, 7, 5, 10, 0, 0)), 28, 1010, 50, ''],  // Row 4: 2026-08 (新しい)
        [new Date(Date.UTC(2026, 5, 25, 10, 0, 0)), 27, 1010, 50, '']  // Row 5: 2026-06 (古い)
      ];

      mockSourceSheet.getLastRow = jest.fn().mockReturnValue(5); // ヘッダー + 4行
      mockSourceSheet.getRange = jest.fn().mockReturnValue({
        getValues: jest.fn().mockReturnValue(values)
      });

      const propMap = new Map([
        ['SPREADSHEET_ID', 'mock_id'],
        ['SHEET_NAME', 'RawData'],
        ['DAILY_LAST_ROW', '10']
      ]);
      global.PropertiesService.getScriptProperties = jest.fn().mockReturnValue({
        getProperty: jest.fn().mockImplementation((k) => propMap.get(k) || null),
        setProperty: jest.fn().mockImplementation((k, v) => propMap.set(k, String(v))),
        getProperties: jest.fn().mockReturnValue(Object.fromEntries(propMap))
      });

      const result = runDataArchive_();
      expect(result.status).toBe('success');
      // 新しいデータ（Row 4）に達した時点で即座に走査が打ち切られるため、
      // アーカイブされるのは先頭の連続した古い2行のみ
      expect(result.archivedRows).toBe(2);
      // deleteRows(2, 2) により先頭の2行だけが安全に削除され、Row 4（新しいデータ）は絶対に削除されない
      expect(mockSourceSheet.deleteRows).toHaveBeenCalledWith(2, 2);
      expect(propMap.get('DAILY_LAST_ROW')).toBe('8');
    });

    it('Test 2b: should stop at chronological inversion even before threshold (古い、新しい、古い)', () => {
      const threshold = new Date(Date.UTC(2026, 6, 31, 15, 0, 0)); // 2026-08-01 00:00 JST
      const values = [
        [new Date(Date.UTC(2026, 4, 15, 10, 0, 0)), 25, 1010, 50, ''], // 2026-05-15
        [new Date(Date.UTC(2026, 5, 20, 10, 0, 0)), 26, 1010, 50, ''], // 2026-06-20
        [new Date(Date.UTC(2026, 5, 10, 10, 0, 0)), 27, 1010, 50, '']  // 2026-06-10 (時系列逆転！)
      ];

      const grouped = groupDataForArchive_(values, threshold);
      let total = 0;
      for (const rows of grouped.values()) {
        total += rows.length;
      }
      // 逆転が発生した3行目は取り込まれず、安全に先頭の2行のみ
      expect(total).toBe(2);
    });

    it('should throw if spreadsheet ID is missing', () => {
      global.PropertiesService.getScriptProperties = jest.fn().mockReturnValue({
        getProperty: jest.fn().mockReturnValue(null),
        getProperties: jest.fn().mockReturnValue({})
      });
      expect(() => runDataArchive_()).toThrow('missing spreadsheet configuration for archive');
    });

    it('should throw if source sheet is missing', () => {
      global.getRawDataSheet_ = jest.fn().mockReturnValue(null);
      mockSpreadsheet.getSheetByName = jest.fn().mockReturnValue(null);
      mockSpreadsheet.getActiveSheet = jest.fn().mockReturnValue(null);
      expect(() => runDataArchive_()).toThrow('Source raw data sheet not found');
    });

    it('should skip if lastRow < 2', () => {
      mockSourceSheet.getLastRow = jest.fn().mockReturnValue(1);
      const result = runDataArchive_();
      expect(result.status).toBe('skipped');
    });

    it('should throw if verification fails', () => {
      mockTargetSheet.getRange = jest.fn().mockImplementation((r, c, numRows) => ({
        setValues: jest.fn(),
        getValues: jest.fn().mockReturnValue(Array(numRows - 1 || 1).fill([1])) // mismatch length
      }));

      expect(() => runDataArchive_()).toThrow(/Verification failed/);
    });
  });
});

describe('DataArchive Logic - Additional Branches', () => {
  it('should fallback to spreadsheetId if ARCHIVE_SPREADSHEET_ID is missing', () => {
    const { runDataArchive_ } = require('../gas/DataArchive.gs');
    // setup mock
    global.PropertiesService = {
      getScriptProperties: jest.fn().mockReturnValue({
        getProperty: jest.fn().mockImplementation((key) => {
          if (key === 'SPREADSHEET_ID') return 'main_sheet_id';
          return null; // ARCHIVE_SPREADSHEET_ID is null
        }),
        getProperties: jest.fn().mockReturnValue({ SPREADSHEET_ID: 'main_sheet_id' })
      })
    };
    const mockSheet = {
      getLastRow: jest.fn().mockReturnValue(1)
    };
    global.getRawDataSheet_ = jest.fn().mockReturnValue(mockSheet);
    global.SpreadsheetApp = {
      openById: jest.fn().mockReturnValue({
        getSheetByName: jest.fn().mockImplementation((name) => {
          if (name === 'Config') return { getDataRange: () => ({ getValues: () => [] }) };
          return mockSheet;
        }),
        insertSheet: jest.fn().mockReturnValue(mockSheet)
      })
    };
    const result = runDataArchive_();
    expect(result.status).toBe('skipped');
    expect(global.SpreadsheetApp.openById).toHaveBeenCalledWith('main_sheet_id');
  });

  it('should skip if groupedData has size 0', () => {
    const { runDataArchive_ } = require('../gas/DataArchive.gs');
    // setup mock
    global.PropertiesService = {
      getScriptProperties: jest.fn().mockReturnValue({
        getProperty: jest.fn().mockImplementation((key) => {
          if (key === 'SPREADSHEET_ID') return 'main_sheet_id';
          return null;
        }),
        getProperties: jest.fn().mockReturnValue({ SPREADSHEET_ID: 'main_sheet_id' })
      })
    };
    const mockSheet = {
      getLastRow: jest.fn().mockReturnValue(3),
      getLastColumn: jest.fn().mockReturnValue(5),
      getRange: jest.fn().mockReturnValue({
        getValues: jest.fn().mockReturnValue([
          // data strictly AFTER the threshold so group size is 0
          [new Date(Date.now() + 86400000), 25, 1010, 50, '']
        ])
      })
    };
    global.getRawDataSheet_ = jest.fn().mockReturnValue(mockSheet);
    global.SpreadsheetApp = {
      openById: jest.fn().mockReturnValue({
        getSheetByName: jest.fn().mockImplementation((name) => {
          if (name === 'Config') return { getDataRange: () => ({ getValues: () => [] }) };
          return mockSheet;
        }),
        insertSheet: jest.fn().mockReturnValue(mockSheet)
      })
    };
    const result = runDataArchive_();
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('no_target_data');
  });

  it('should acquire and release lock if not already holding lock', () => {
    let waitLockCalled = false;
    let releaseLockCalled = false;
    global.LockService = {
      getScriptLock: jest.fn().mockReturnValue({
        hasLock: jest.fn().mockReturnValue(false),
        waitLock: jest.fn().mockImplementation(() => { waitLockCalled = true; }),
        releaseLock: jest.fn().mockImplementation(() => { releaseLockCalled = true; })
      })
    };

    const mockSheet = { getLastRow: jest.fn().mockReturnValue(1) };
    global.getRawDataSheet_ = jest.fn().mockReturnValue(mockSheet);
    global.SpreadsheetApp = {
      openById: jest.fn().mockReturnValue({
        getSheetByName: jest.fn().mockImplementation((name) => {
          if (name === 'Config') return { getDataRange: () => ({ getValues: () => [] }) };
          return mockSheet;
        })
      })
    };
    global.PropertiesService = {
      getScriptProperties: jest.fn().mockReturnValue({
        getProperty: jest.fn().mockReturnValue('mock_id'),
        getProperties: jest.fn().mockReturnValue({ SPREADSHEET_ID: 'mock_id' })
      })
    };

    const res = runDataArchive_();
    expect(res.status).toBe('skipped');
    expect(waitLockCalled).toBe(true);
    expect(releaseLockCalled).toBe(true);
  });
});

describe('updateDailyLastRowAfterPurge_', () => {
  it('Test 3a: should decrement DAILY_LAST_ROW correctly (100 - 30 = 70)', () => {
    const store = new Map([['DAILY_LAST_ROW', '100']]);
    const mockProps = {
      getProperty: (k) => store.get(k) || null,
      setProperty: (k, v) => store.set(k, String(v))
    };
    updateDailyLastRowAfterPurge_(mockProps, 30);
    expect(store.get('DAILY_LAST_ROW')).toBe('70');
  });

  it('Test 3b: should floor at 1 if totalArchived exceeds currentDailyLastRow (20 - 50 = 1)', () => {
    const store = new Map([['DAILY_LAST_ROW', '20']]);
    const mockProps = {
      getProperty: (k) => store.get(k) || null,
      setProperty: (k, v) => store.set(k, String(v))
    };
    updateDailyLastRowAfterPurge_(mockProps, 50);
    expect(store.get('DAILY_LAST_ROW')).toBe('1');
  });

  it('should do nothing if DAILY_LAST_ROW is not set or invalid', () => {
    const store = new Map();
    const mockProps = {
      getProperty: (k) => store.get(k) || null,
      setProperty: (k, v) => store.set(k, String(v))
    };
    updateDailyLastRowAfterPurge_(mockProps, 50);
    expect(store.has('DAILY_LAST_ROW')).toBe(false);

    store.set('DAILY_LAST_ROW', 'invalid_num');
    updateDailyLastRowAfterPurge_(mockProps, 50);
    expect(store.get('DAILY_LAST_ROW')).toBe('invalid_num');

    updateDailyLastRowAfterPurge_(null, 50);
    updateDailyLastRowAfterPurge_(mockProps, 0);
    expect(store.get('DAILY_LAST_ROW')).toBe('invalid_num');
  });
});

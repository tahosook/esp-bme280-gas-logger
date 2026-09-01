const { runDataArchive_, getArchiveThresholdDate_, groupDataForArchive_ } = require('../gas/DataArchive.gs');

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

    it('should handle string dates and skip invalid dates', () => {
      const threshold = new Date(Date.UTC(2026, 6, 31, 15, 0, 0)); // 2026-08-01 00:00 JST
      const values = [
        ['invalid_date', 0, 0, 0],
        [null, 0, 0, 0],
        ['2026-06-01T00:00:00Z', 26, 1010, 50, '']
      ];

      const grouped = groupDataForArchive_(values, threshold);
      expect(grouped.size).toBe(1);
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
});

/**
 * dataProcessing.js
 * Handles file ingestion, profiling, validation rules, and disturbance injection.
 */

const DataProcessor = {
  pendingReads: 0,

  handleFiles: function(files) {
    const exts = ['.csv', '.xlsx', '.xls', '.json', '.tsv', '.txt'];
    const valid = Array.from(files).filter(f => exts.some(e => f.name.toLowerCase().endsWith(e)));
    
    if (!valid.length) {
      app.showToast('No supported files. Use CSV, Excel, JSON or TSV.', 'error');
      return;
    }
    
    valid.forEach(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      
      // Warn if large file
      if(file.size > 5 * 1024 * 1024) {
        app.showToast(`Warning: ${file.name} is large (>5MB) and may take time to process.`, 'warn');
      }

      if (ext === 'xlsx' || ext === 'xls') {
        this.handleExcelFile(file);
      } else if (ext === 'json') {
        this.handleJSONFile(file);
      } else {
        this.handleCSVFile(file);
      }
    });
  },

  handleExcelFile: function(file) {
    this.pendingReads++;
    app.updateLoadingMsg();
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        if (!window.XLSX) throw new Error('SheetJS not loaded');
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (!raw.length) throw new Error('Empty sheet');
        const headers = raw[0].map(h => String(h ?? '').trim()).filter(Boolean);
        const rows = raw.slice(1).map(row => {
          const o = {};
          headers.forEach((h, i) => o[h] = row[i] == null ? '' : String(row[i]).trim());
          return o;
        }).filter(r => Object.values(r).some(v => v !== ''));
        
        if (--this.pendingReads <= 0) app.hideLoading();
        this.addParsedFile(file, headers, rows);
        app.showToast(`"${file.name}" — ${rows.length} rows from "${wb.SheetNames[0]}"`, 'success');
      } catch (e) {
        if (--this.pendingReads <= 0) app.hideLoading();
        app.showToast('Excel error: ' + e.message, 'error');
      }
    };
    reader.onerror = ev => {
      if (--this.pendingReads <= 0) app.hideLoading();
      app.showToast(`Cannot read "${file.name}". Ensure it is accessible.`, 'error', 8000);
    };
    reader.readAsArrayBuffer(file);
  },

  handleJSONFile: function(file) {
    this.pendingReads++;
    app.updateLoadingMsg();
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const json = JSON.parse(ev.target.result);
        let rows = Array.isArray(json) ? json : (json.data || json.rows || json.records || json.items || Object.values(json).find(Array.isArray));
        if (!Array.isArray(rows) || !rows.length) throw new Error('No record array found');
        rows = rows.filter(r => r && typeof r === 'object' && !Array.isArray(r));
        const headers = [...new Set(rows.flatMap(r => Object.keys(r)))];
        const norm = rows.map(r => {
          const o = {};
          headers.forEach(h => o[h] = r[h] == null ? '' : String(r[h]).trim());
          return o;
        });
        
        if (--this.pendingReads <= 0) app.hideLoading();
        this.addParsedFile(file, headers, norm);
        app.showToast(`"${file.name}" — ${norm.length} records`, 'success');
      } catch (e) {
        if (--this.pendingReads <= 0) app.hideLoading();
        app.showToast('JSON error: ' + e.message, 'error');
      }
    };
    reader.onerror = ev => {
      if (--this.pendingReads <= 0) app.hideLoading();
      app.showToast(`Cannot read "${file.name}".`, 'error');
    };
    reader.readAsText(file);
  },

  handleCSVFile: function(file) {
    this.pendingReads++;
    app.updateLoadingMsg();
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target.result;
      const delim = this.detectDelimiter(text);
      const done = (headers, rows) => {
        if (--this.pendingReads <= 0) app.hideLoading();
        this.addParsedFile(file, headers, rows);
        app.showToast(`"${file.name}" — ${rows.length} rows`, 'success');
      };
      const fail = (msg) => {
        try {
          const p = this.fallbackParseCSV(text, delim);
          done(p.headers, p.rows);
        } catch (e) {
          if (--this.pendingReads <= 0) app.hideLoading();
          app.showToast(msg + ': ' + e.message, 'error');
        }
      };
      
      if (window.Papa) {
        Papa.parse(text, {
          header: true, skipEmptyLines: true, dynamicTyping: false, delimiter: delim,
          complete: r => done(r.meta.fields || [], r.data || []),
          error: () => fail('Parse error')
        });
      } else {
        fail('PapaParse not loaded');
      }
    };
    reader.onerror = ev => {
      if (--this.pendingReads <= 0) app.hideLoading();
      app.showToast(`Cannot read "${file.name}".`, 'error');
    };
    reader.readAsText(file);
  },

  detectDelimiter: function(text) {
    const s = text.slice(0, 2048);
    const c = [
      [(s.match(/\t/g) || []).length, '\t'],
      [(s.match(/,/g) || []).length, ','],
      [(s.match(/\|/g) || []).length, '|'],
      [(s.match(/;/g) || []).length, ';']
    ];
    return c.sort((a, b) => b[0] - a[0])[0][1];
  },

  fallbackParseCSV: function(text, delim = ',') {
    const lines = text.trim().split(/\r?\n/);
    const splitCSVLine = (line, delim) => {
      const out = [];
      let cur = '', q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = !q;
        else if (ch === delim && !q) { out.push(cur); cur = ''; }
        else cur += ch;
      }
      out.push(cur);
      return out;
    };
    const cleanCell = v => String(v ?? '').trim().replace(/^"|"$/g, '');
    
    const headers = splitCSVLine(lines[0], delim).map(cleanCell);
    const rows = lines.slice(1).map(line => {
      const vals = splitCSVLine(line, delim).map(cleanCell);
      const o = {};
      headers.forEach((h, i) => o[h] = vals[i] ?? '');
      return o;
    });
    return { headers, rows };
  },

  addParsedFile: function(file, headers, rows) {
    headers = headers.filter(Boolean);
    rows = rows.map(r => {
      const o = {};
      headers.forEach(h => o[h] = r[h] == null ? '' : String(r[h]).trim());
      return o;
    });
    
    AppState.uploadedFiles.push({ name: file.name, size: file.size, data: { headers, rows } });

    ScoringModel.addAuditEvent('Info', 'Dataset Ingestion', 'Data Integrity', `${file.name} uploaded — ${rows.length} rows, ${headers.length} columns.`, 'Dataset registered.');

    const newIdx = AppState.uploadedFiles.length - 1;
    app.renderFileList();
    app.showPreview(AppState.uploadedFiles[newIdx].data, AppState.uploadedFiles[newIdx].name, newIdx);
    app.renderColMap();
    app.markDone('upload');
    app.updateSideStatus();
  },

  autoDetectHeader: function(headers, id) {
    const d = AppState.FIELD_DEFS.find(x => x[0] === id);
    if (!d) return '';
    const keys = d[2].map(k => k.toLowerCase());
    const exact = headers.find(h => h.toLowerCase() === id.toLowerCase());
    return exact || headers.find(h => keys.some(k => h.toLowerCase().includes(k))) || '';
  },

  // ---------------------------------------------------------
  // VALIDATION & PROFILING
  // ---------------------------------------------------------

  profileFiles: function(files, mappings = {}) {
    const rows = files.flatMap(f => f.data.rows.map((r, i) => ({ __file: f.name, __rowIdx: i + 1, ...r })));
    const headers = [...new Set(files.flatMap(f => f.data.headers))];
    
    let missing = 0, total = 0, invalid = 0, numCells = 0;
    const numCols = [];
    
    files.forEach(f => {
      f.data.headers.forEach(h => {
        const vals = f.data.rows.map(r => r[h]).filter(v => !this.isMissing(v));
        const hits = vals.filter(this.isNumeric).length;
        if (vals.length && hits / vals.length >= 0.8) numCols.push(h);
        
        f.data.rows.forEach(r => {
          total++;
          if (this.isMissing(r[h])) missing++;
          if (this.looksNumericHeader(h) && !this.isMissing(r[h])) {
            numCells++;
            if (!this.isNumeric(r[h])) invalid++;
          }
        });
      });
    });

    const dupRows = this.countDuplicates(rows.map(r => {
        const copy = {...r}; delete copy.__file; delete copy.__rowIdx;
        return JSON.stringify(Object.keys(copy).sort().map(k => [k, copy[k]]));
    }));

    const supplierCol = mappings.supplier_id || this.autoDetectHeader(headers, 'supplier_id');
    const supplierFile = files.find(f => /supplier|vendor|master/i.test(f.name)) || files.find(f => f.data.headers.includes(supplierCol) && f.data.headers.some(h => /compliance|financial/i.test(h))) || files[0];
    
    const master = new Set(supplierCol && supplierFile ? (supplierFile.data.rows.map(r => r[supplierCol]).filter(v => !this.isMissing(v))) : []);
    const ids = supplierCol ? rows.map(r => r[supplierCol]).filter(v => !this.isMissing(v)) : [];
    
    let linkErr = 0, linkChk = 0;
    if (supplierCol && master.size) {
      files.filter(f => f !== supplierFile).forEach(f => {
        f.data.rows.forEach(r => {
          const id = r[supplierCol];
          if (!this.isMissing(id)) {
            linkChk++;
            if (!master.has(id)) linkErr++;
          }
        });
      });
    }

    const transparencyHeaders = headers.filter(h => ['audit', 'reason', 'explanation', 'reviewer', 'timestamp', 'approval'].some(k => h.toLowerCase().includes(k)));
    const critical = this.criticalMissing(files, mappings, headers);
    const scoreConsist = this.scoreConsistency(files, mappings);
    const outRep = this.outliers(files);

    // Record Level Issues
    const recordIssues = this.generateRecordLevelIssues(files, mappings, headers, supplierCol, master, supplierFile);

    return {
      totalFiles: files.length,
      totalRows: rows.length,
      totalCells: total,
      missingCells: missing,
      missingRate: this.rate(missing, total),
      duplicateRows: dupRows,
      duplicateRate: this.rate(dupRows, Math.max(1, rows.length)),
      duplicateSupplierIds: this.countDuplicates(ids),
      duplicateSupplierRate: this.rate(this.countDuplicates(ids), Math.max(1, ids.length)),
      invalidNumeric: invalid,
      numericCellCount: numCells,
      invalidNumericRate: this.rate(invalid, Math.max(1, numCells)),
      numericColumns: [...new Set(numCols)],
      linkageErrors: linkErr,
      linkageChecks: linkChk,
      linkageErrorRate: this.rate(linkErr, Math.max(1, linkChk)),
      scoreConsistency: scoreConsist,
      outlierReport: outRep,
      transparencyFieldCount: transparencyHeaders.length,
      transparencyFieldsPresent: transparencyHeaders,
      criticalMissingRate: critical.rate,
      criticalMissingCount: critical.count,
      mappedFieldsCount: Object.values(mappings).filter(Boolean).length,
      allHeaders: headers,
      recordIssues: recordIssues
    };
  },

  generateRecordLevelIssues: function(files, mappings, headers, supplierCol, masterSet, supplierFile) {
    const issues = [];
    
    // Check constraints mapping
    const rules = {
      scoreCols: ['technical_score', 'price_score', 'ai_ranking_score', 'kpi_score'].map(k => mappings[k] || this.autoDetectHeader(headers, k)).filter(Boolean),
      statusCol: mappings['compliance_status'] || this.autoDetectHeader(headers, 'compliance_status'),
      dateCols: headers.filter(h => /date|time/i.test(h))
    };

    files.forEach(f => {
      f.data.rows.forEach((r, i) => {
        const rowNum = i + 1;
        const suppId = r[supplierCol] || '—';
        const recId = r['record_id'] || r['bid_id'] || r['audit_trail_id'] || `Row-${rowNum}`;

        // 1. Invalid Numeric/Score Range (0-100)
        rules.scoreCols.forEach(sc => {
          if (sc in r && !this.isMissing(r[sc])) {
            const v = parseFloat(r[sc]);
            if (isNaN(v)) {
              issues.push({ severity: 'High', type: 'Data Type', dataset: f.name, rowNum, recId, suppId, field: sc, problem: 'Score is not a valid number', action: 'Correct data type' });
            } else if (v < 0 || v > 100) {
              issues.push({ severity: 'Medium', type: 'Out of Range', dataset: f.name, rowNum, recId, suppId, field: sc, problem: `Score ${v} falls outside 0-100 boundary`, action: 'Normalize score' });
            }
          }
        });

        // 2. Linkage Errors
        if (f !== supplierFile && supplierCol in r && !this.isMissing(r[supplierCol])) {
          if (!masterSet.has(r[supplierCol])) {
            issues.push({ severity: 'High', type: 'Broken Link', dataset: f.name, rowNum, recId, suppId, field: supplierCol, problem: `Supplier ID not found in Master Data`, action: 'Add supplier to master or correct ID' });
          }
        }

        // 3. Dates validity
        rules.dateCols.forEach(dc => {
          if (dc in r && !this.isMissing(r[dc])) {
             const d = new Date(r[dc]);
             if (isNaN(d.getTime())) {
               issues.push({ severity: 'Low', type: 'Invalid Date', dataset: f.name, rowNum, recId, suppId, field: dc, problem: `Unrecognized date format`, action: 'Standardize to ISO-8601' });
             }
          }
        });

        // 4. Missing required justifications/audits for low scores
        if (mappings['ai_ranking_score'] && r[mappings['ai_ranking_score']]) {
            const ai = parseFloat(r[mappings['ai_ranking_score']]);
            if (ai < 50 && this.isMissing(r[mappings['decision_reason']])) {
               issues.push({ severity: 'Medium', type: 'Missing Audit', dataset: f.name, rowNum, recId, suppId, field: mappings['decision_reason'], problem: `Low AI score (${ai}) lacks explanation`, action: 'Require reviewer comment' });
            }
        }
      });
    });

    return issues;
  },

  scoreConsistency: function(files, m) {
    let checked = 0, deviations = 0;
    files.forEach(f => {
      const tech = m.technical_score || this.autoDetectHeader(f.data.headers, 'technical_score');
      const price = m.price_score || this.autoDetectHeader(f.data.headers, 'price_score');
      const ai = m.ai_ranking_score || this.autoDetectHeader(f.data.headers, 'ai_ranking_score');
      
      if (!tech || !price || !ai) return;
      
      f.data.rows.forEach(r => {
        if (this.isNumeric(r[tech]) && this.isNumeric(r[price]) && this.isNumeric(r[ai])) {
          checked++;
          const expected = parseFloat(r[tech]) * 0.6 + parseFloat(r[price]) * 0.4;
          if (Math.abs(parseFloat(r[ai]) - expected) > 4) deviations++;
        }
      });
    });
    return { checked, deviations, deviationRate: this.rate(deviations, Math.max(1, checked)) };
  },

  outliers: function(files) {
    let checked = 0, outs = 0;
    files.forEach(f => f.data.headers.forEach(h => {
      if (!this.looksNumericHeader(h)) return;
      const vals = f.data.rows.map(r => parseFloat(r[h])).filter(Number.isFinite);
      if (vals.length < 8) return;
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) || 0;
      if (!sd) return;
      vals.forEach(v => {
        checked++;
        if (Math.abs((v - mean) / sd) > 2.5) outs++;
      });
    }));
    return { checked, outliers: outs, outlierRate: this.rate(outs, Math.max(1, checked)) };
  },

  criticalMissing: function(files, m, headers) {
    const critical = ['supplier_id', 'compliance_status', 'financial_rating', 'delivery_reliability', 'technical_score', 'price_score', 'ai_ranking_score', 'kpi_score']
      .map(f => m[f] || this.autoDetectHeader(headers, f))
      .filter(Boolean);
    let count = 0, total = 0;
    files.forEach(f => f.data.rows.forEach(r => critical.forEach(c => {
      if (c in r) {
        total++;
        if (this.isMissing(r[c])) count++;
      }
    })));
    return { count, total, rate: this.rate(count, Math.max(1, total)) };
  },

  // ---------------------------------------------------------
  // DISTURBANCE INJECTION (SCN-003)
  // ---------------------------------------------------------

  injectDisturbances: function(files, m, config = { missing: 0.15, dupes: 0.1, drift: 0.2 }) {
    const cloned = this.cloneFiles(files);
    const headers = cloned.flatMap(f => f.data.headers);
    const critical = ['compliance_status', 'financial_rating', 'delivery_reliability', 'technical_score', 'price_score', 'ai_ranking_score', 'kpi_score']
      .map(f => m[f] || this.autoDetectHeader(headers, f)).filter(Boolean);
    
    let summaryData = {
        missingAffected: 0,
        driftAffected: 0,
        dupeRowsAdded: 0
    };

    cloned.forEach(file => {
      // Missing Data & Score Drift
      file.data.rows.forEach((row, i) => {
        critical.forEach((field, j) => {
          if (field in row && this.seeded(i + j * 13 + file.name.length) < config.missing) {
            row[field] = '';
            summaryData.missingAffected++;
          }
        });
        
        ['technical_score', 'price_score', 'ai_ranking_score', 'kpi_score'].forEach(f => {
          const field = m[f] || this.autoDetectHeader(file.data.headers, f);
          if (field && this.isNumeric(row[field]) && this.seeded(i * 17 + field.length) < config.drift) {
            const val = parseFloat(row[field]);
            row[field] = (val * (1 + (this.seeded(i * 31 + field.length) - 0.5) * 0.4)).toFixed(2);
            summaryData.driftAffected++;
          }
        });
      });
      
      // Duplicates
      const duplicatesToAdd = file.data.rows.filter((_, i) => this.seeded(i * 23 + file.name.length) < config.dupes).map(r => ({ ...r }));
      summaryData.dupeRowsAdded += duplicatesToAdd.length;
      file.data.rows = file.data.rows.concat(duplicatesToAdd);
    });

    AppState.lastDisturbanceSummary = summaryData;
    return cloned;
  },

  // ---------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------

  isMissing: v => v == null || String(v).trim() === '' || ['na', 'n/a', 'null', 'undefined', '-'].includes(String(v).trim().toLowerCase()),
  isNumeric: v => v !== '' && !isNaN(parseFloat(v)) && isFinite(v),
  looksNumericHeader: h => /score|rating|rate|reliability|performance|amount|price|cost|kpi|percentage|percent|value|quality/i.test(h),
  countDuplicates: arr => {
    const seen = new Set(), dup = new Set();
    arr.filter(v => !DataProcessor.isMissing(v)).forEach(v => seen.has(v) ? dup.add(v) : seen.add(v));
    return dup.size;
  },
  rate: (a, b) => b ? Math.max(0, a / b) : 0,
  cloneFiles: files => JSON.parse(JSON.stringify(files)),
  seeded: n => {
    const x = Math.sin(n + 1) * 10000;
    return x - Math.floor(x);
  }
};

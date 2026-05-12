/**
 * app.js
 * Main application logic, state management, and UI rendering.
 */

const AppState = {
  uploadedFiles: [],
  selectedScenario: 1,
  auditLog: [],
  lastResults: null,
  allScenarioResults: null,
  
  THRESHOLDS: { integrity: 95, accuracy: 85, transparency: 90, reliability: 90, robustness: 85 },
  WEIGHTS: { integrity: 25, accuracy: 25, transparency: 20, reliability: 15, robustness: 15 },
  
  ATTRS: [
    { key: 'data_integrity', label: 'Data Integrity', thKey: 'integrity' },
    { key: 'accuracy', label: 'Accuracy', thKey: 'accuracy' },
    { key: 'transparency', label: 'Transparency', thKey: 'transparency' },
    { key: 'reliability', label: 'Reliability', thKey: 'reliability' },
    { key: 'robustness', label: 'Robustness', thKey: 'robustness' }
  ],
  
  FIELD_DEFS: [
    ['supplier_id', 'Supplier ID', ['supplier_id', 'supplier', 'vendor_id', 'vendor']],
    ['compliance_status', 'Compliance Status', ['compliance_status', 'compliance', 'status']],
    ['financial_rating', 'Financial Rating', ['financial_rating', 'financial', 'rating']],
    ['delivery_reliability', 'Delivery Reliability', ['delivery_reliability', 'delivery', 'reliability']],
    ['technical_score', 'Technical Score', ['technical_score', 'technical']],
    ['price_score', 'Price Score', ['price_score', 'price']],
    ['ai_ranking_score', 'AI Ranking Score', ['ai_ranking_score', 'ranking', 'ai_score']],
    ['kpi_score', 'KPI Score', ['kpi_score', 'performance', 'kpi']],
    ['audit_trail_id', 'Audit Trail ID', ['audit_trail_id', 'audit', 'log_id']],
    ['decision_reason', 'Decision Reason', ['decision_reason', 'reason', 'explanation', 'comment']]
  ],
  
  BC: { dashboard: 'Dashboard', upload: 'Upload Data', configure: 'Configure', results: 'Results', comparison: 'Comparison', sensitivity: 'Sensitivity Analysis', audit: 'Audit Log', methodology: 'Methodology' },
  
  lastDisturbanceSummary: null
};

// Chart instances
let radarInstance = null, gaugeInstance = null, barInstance = null, comparisonInstance = null, sensitivityInstance = null;

const app = {
  
  init: function() {
    this.renderThresholds();
    this.renderWeights();
    
    setInterval(() => {
      const now = new Date();
      document.getElementById('sysTime').textContent = now.toLocaleTimeString('en-GB', { hour12: false });
    }, 1000);
    
    document.getElementById('sysSession').textContent = 'SES-' + Math.random().toString(36).slice(2, 7).toUpperCase();
    
    // Check saved theme
    if(localStorage.getItem('theme') === 'light') {
      this.toggleTheme(true);
    }
  },

  toggleTheme: function(forceLight) {
    const html = document.documentElement;
    const btn = document.getElementById('themeToggleBtn');
    
    if (forceLight || html.getAttribute('data-theme') === 'dark') {
      html.setAttribute('data-theme', 'light');
      btn.textContent = '🌙 Dark Mode';
      localStorage.setItem('theme', 'light');
    } else {
      html.setAttribute('data-theme', 'dark');
      btn.textContent = '☀ Light Mode';
      localStorage.setItem('theme', 'dark');
    }
    
    if (AppState.lastResults) {
      this.renderCharts(AppState.lastResults);
    }
    if (AppState.allScenarioResults) {
      this.displayComparison(AppState.allScenarioResults);
    }
  },

  showPanel: function(name, el) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.navbtn').forEach(n => n.classList.remove('active'));
    
    const panel = document.getElementById('panel-' + name);
    if(panel) panel.classList.add('active');
    
    if(el) el.classList.add('active');
    else {
      const navBtn = document.querySelector(`.navbtn[data-panel="${name}"]`);
      if(navBtn) navBtn.classList.add('active');
    }
    
    const bc = document.getElementById('bcCurrent');
    if (bc) bc.textContent = AppState.BC[name] || name;
  },

  markDone: function(name) {
    const btn = document.querySelector(`.navbtn[data-panel="${name}"]`);
    if(btn) btn.classList.add('done');
    
    // Update progress bar based on done items
    const totalSteps = 6;
    const doneCount = document.querySelectorAll('.navbtn.done').length;
    document.getElementById('workflowProgress').style.width = Math.min((doneCount / totalSteps) * 100 + 15, 100) + '%';
  },

  updateSideStatus: function() {
    document.getElementById('sbFileCount').textContent = AppState.uploadedFiles.length;
    document.getElementById('dashFiles').textContent = AppState.uploadedFiles.length;
    
    const scenarios = { 1: '1 — Baseline', 2: '2 — Model-Enhanced', 3: '3 — Disturbed' };
    document.getElementById('sbScenario').textContent = scenarios[AppState.selectedScenario] || AppState.selectedScenario;
  },

  showToast: function(msg, type = 'info', dur = 4500) {
    const ic = { info: 'ℹ', success: '✓', error: '✕', warn: '⚠' };
    const d = document.createElement('div');
    d.className = 'toast ' + (type === 'success' ? 'ts' : type === 'error' ? 'te' : type === 'warn' ? 'tw' : '');
    d.innerHTML = `<span class="toast-ic">${ic[type] || 'ℹ'}</span><span class="toast-tx">${this.esc(msg)}</span><button class="toast-cl" onclick="this.closest('.toast').remove()" aria-label="Close Toast">×</button>`;
    document.getElementById('toastContainer').appendChild(d);
    setTimeout(() => {
      d.style.animation = 'tOut .22s ease forwards';
      setTimeout(() => d.remove(), 230);
    }, dur);
  },

  updateLoadingMsg: function() {
    const n = DataProcessor.pendingReads;
    document.getElementById('oMsg').textContent = n > 1 ? `READING ${n} FILES…` : 'READING FILE…';
    if (n > 0) document.getElementById('loadingOverlay').classList.add('show');
  },
  
  showLoading: function(m) {
    document.getElementById('oMsg').textContent = m || 'PROCESSING…';
    document.getElementById('loadingOverlay').classList.add('show');
  },
  
  hideLoading: function() {
    document.getElementById('loadingOverlay').classList.remove('show');
  },

  // File UI
  dragOver: function(e) { e.preventDefault(); document.getElementById('dropzone').classList.add('drag'); },
  dragLeave: function() { document.getElementById('dropzone').classList.remove('drag'); },
  dropFiles: function(e) { e.preventDefault(); this.dragLeave(); DataProcessor.handleFiles(e.dataTransfer.files); },
  handleFiles: function(files) { DataProcessor.handleFiles(files); },

  renderFileList: function() {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = AppState.uploadedFiles.map((f, i) => `
      <div class="file">
        <span class="badge bN">${f.name.split('.').pop().toUpperCase()}</span>
        <span class="fname">${this.esc(f.name)}</span>
        <span class="fmeta">${(f.size / 1024).toFixed(1)}KB &nbsp;·&nbsp; ${f.data.rows.length} rows &nbsp;·&nbsp; ${f.data.headers.length} cols</span>
        <button class="x" onclick="app.removeFile(${i})" title="Remove" aria-label="Remove File">✕</button>
      </div>`).join('');
      
    const b = document.getElementById('fileCountBadge');
    if (b) {
      b.textContent = AppState.uploadedFiles.length;
      b.style.display = AppState.uploadedFiles.length ? 'inline-flex' : 'none';
    }
  },

  removeFile: function(i) {
    const n = AppState.uploadedFiles[i]?.name || 'file';
    AppState.uploadedFiles.splice(i, 1);
    ScoringModel.addAuditEvent('Info', 'Dataset Ingestion', 'Data Integrity', `${n} removed.`, 'Excluded from workspace.');
    this.renderFileList();
    
    if (AppState.uploadedFiles.length) {
      this.showPreview(AppState.uploadedFiles[0].data, AppState.uploadedFiles[0].name, 0);
      this.renderColMap();
    } else {
      document.getElementById('previewCard').style.display = 'none';
      document.getElementById('colMapCard').style.display = 'none';
    }
    this.showToast(`"${n}" removed`, 'warn');
    this.updateSideStatus();
  },

  confirmClearAll: function() {
    if(confirm("Are you sure you want to clear all data and results? This cannot be undone.")) {
       this.clearAll();
    }
  },

  clearAll: function() {
    AppState.uploadedFiles = [];
    AppState.auditLog = [];
    AppState.lastResults = null;
    AppState.allScenarioResults = null;
    
    this.renderFileList();
    this.renderAuditLog();
    
    document.getElementById('previewCard').style.display = 'none';
    document.getElementById('colMapCard').style.display = 'none';
    document.getElementById('resultsEmpty').style.display = 'block';
    document.getElementById('resultsContent').style.display = 'none';
    document.getElementById('comparisonEmpty').style.display = 'block';
    document.getElementById('comparisonContent').style.display = 'none';
    document.getElementById('sensitivityEmpty').style.display = 'block';
    document.getElementById('sensitivityContent').style.display = 'none';
    document.getElementById('dashScore').textContent = '—';
    document.getElementById('dashScore').className = 'mval neutral';
    
    this.showToast('Workspace cleared', 'info');
    this.updateSideStatus();
  },

  showPreview: function(data, name, fileIndex) {
    const previewCard = document.getElementById('previewCard');
    const previewContent = document.getElementById('previewContent');
    previewCard.style.display = 'block';

    const idx = fileIndex != null ? fileIndex : 0;

    // Render dataset switching tabs when multiple files are loaded
    const tabsContainer = document.getElementById('previewTabs');
    if (tabsContainer) {
      if (AppState.uploadedFiles.length > 1) {
        tabsContainer.innerHTML = AppState.uploadedFiles.map((f, i) => {
          const label = f.name.length > 18 ? f.name.substring(0, 15) + '…' : f.name;
          return `<button class="btn-sm ${i === idx ? 'btn1' : 'btn2'}" onclick="app.switchPreview(${i})" title="${this.esc(f.name)}">${this.esc(label)}</button>`;
        }).join('');
      } else {
        tabsContainer.innerHTML = '';
      }
    }

    const cols = data.headers.slice(0, 8);
    let html = `<p style="margin-bottom:8px;font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace">${this.esc(name)} — ${data.headers.length} columns, ${data.rows.length} rows</p>
                <div class="tablewrap"><table><thead><tr>${cols.map(h => `<th>${this.esc(h)}</th>`).join('')}</tr></thead><tbody>`;
    data.rows.slice(0, 5).forEach(r => html += `<tr>${cols.map(h => `<td>${this.esc(r[h] || '—')}</td>`).join('')}</tr>`);
    html += '</tbody></table></div>';

    const fileForProfile = AppState.uploadedFiles[idx];
    const p = DataProcessor.profileFiles(fileForProfile ? [fileForProfile] : AppState.uploadedFiles);
    html += `
      <div class="grid4" style="margin-top:.85rem">
        <div class="metric"><div class="mlabel">Total Rows</div><div class="mval neutral">${p.totalRows}</div></div>
        <div class="metric"><div class="mlabel">Missing Cells</div><div class="mval ${p.missingRate > .1 ? 'bad' : p.missingRate > .03 ? 'warn' : 'good'}">${ScoringModel.pct(p.missingRate)}</div></div>
        <div class="metric"><div class="mlabel">Duplicate Rows</div><div class="mval ${p.duplicateRate > .05 ? 'bad' : p.duplicateRate > .01 ? 'warn' : 'good'}">${ScoringModel.pct(p.duplicateRate)}</div></div>
        <div class="metric"><div class="mlabel">Numeric Cols</div><div class="mval neutral">${p.numericColumns.length}</div></div>
      </div>`;
    previewContent.innerHTML = html;
  },

  switchPreview: function(index) {
    const file = AppState.uploadedFiles[index];
    if (file) this.showPreview(file.data, file.name, index);
  },

  profileUploadedData: function() {
    if (!AppState.uploadedFiles.length) return this.showToast('Upload a file or load demo data first.', 'error');
    this.showPreview(AppState.uploadedFiles[0].data, AppState.uploadedFiles[0].name, 0);
    ScoringModel.addAuditEvent('Info', 'Dataset Profiling', 'Data Integrity', 'Manual profiling executed.', 'Preview updated.');
    this.renderAuditLog();
    this.showToast('Profile updated', 'success');
  },

  renderColMap: function() {
    if (!AppState.uploadedFiles.length) return;
    document.getElementById('colMapCard').style.display = 'block';
    const headers = [...new Set(AppState.uploadedFiles.flatMap(f => f.data.headers))];
    const opts = ['', ...headers].map(h => `<option value="${this.esc(h)}">${h ? this.esc(h) : '— unmapped —'}</option>`).join('');
    
    document.getElementById('colMapContent').innerHTML = AppState.FIELD_DEFS.map(([id, label]) => `
      <div class="mapitem">
        <label for="cm-${id}">${label}</label>
        <select id="cm-${id}">${opts}</select>
      </div>`).join('');
      
    AppState.FIELD_DEFS.forEach(([id]) => {
      const el = document.getElementById('cm-' + id);
      if (el) el.value = DataProcessor.autoDetectHeader(headers, id);
    });
  },

  getMappings: function() {
    const m = {};
    AppState.FIELD_DEFS.forEach(([id]) => m[id] = document.getElementById('cm-' + id)?.value || '');
    return m;
  },

  // Configuration UI
  renderThresholds: function() {
    const labels = { integrity: 'Data Integrity', accuracy: 'Accuracy', transparency: 'Transparency', reliability: 'Reliability', robustness: 'Robustness' };
    document.getElementById('thresholdGrid').innerHTML = Object.entries(AppState.THRESHOLDS).map(([k, v]) => `
      <div class="th">
        <label><span>${labels[k]}</span><span id="th-${k}-val">${v}%</span></label>
        <input type="range" min="50" max="99" value="${v}" oninput="AppState.THRESHOLDS['${k}']=+this.value;document.getElementById('th-${k}-val').textContent=this.value+'%'">
      </div>`).join('');
  },

  resetThresholds: function() {
    AppState.THRESHOLDS = { integrity: 95, accuracy: 85, transparency: 90, reliability: 90, robustness: 85 };
    this.renderThresholds();
    this.showToast('Thresholds reset to defaults', 'info');
  },

  renderWeights: function() {
    const labels = { integrity: 'Data Integrity', accuracy: 'Accuracy', transparency: 'Transparency', reliability: 'Reliability', robustness: 'Robustness' };
    document.getElementById('weightsGrid').innerHTML = Object.entries(AppState.WEIGHTS).map(([k, v]) => `
      <div class="th">
        <label><span>${labels[k]}</span><span id="w-${k}-val">${v}%</span></label>
        <input type="range" min="0" max="50" value="${v}" oninput="app.updateWeight('${k}', this.value)">
      </div>`).join('');
    this.validateWeights();
  },

  updateWeight: function(key, val) {
    AppState.WEIGHTS[key] = +val;
    document.getElementById(`w-${key}-val`).textContent = val + '%';
    this.validateWeights();
  },

  validateWeights: function() {
    const total = Object.values(AppState.WEIGHTS).reduce((a, b) => a + b, 0);
    const badge = document.getElementById('weightTotalBadge');
    badge.textContent = total + '%';
    
    const runBtn = document.getElementById('runBtn');
    const runAllBtn = document.getElementById('runAllBtn');
    
    if (total === 100) {
      badge.className = 'weight-total valid';
      runBtn.disabled = false;
      runAllBtn.disabled = false;
    } else {
      badge.className = 'weight-total invalid';
      runBtn.disabled = true;
      runAllBtn.disabled = true;
    }
  },

  resetWeights: function() {
    AppState.WEIGHTS = { integrity: 25, accuracy: 25, transparency: 20, reliability: 15, robustness: 15 };
    this.renderWeights();
    this.showToast('Weights reset to defaults', 'info');
  },

  selectScenario: function(n, el) {
    AppState.selectedScenario = n;
    document.querySelectorAll('.scenario').forEach(c => c.classList.remove('sel'));
    el.classList.add('sel');
    
    const hints = {
      1: 'SCN-001 — Baseline: Runs without QA controls and keeps data weaknesses unresolved.',
      2: 'SCN-002 — Model-Enhanced: Activates validation, quality gates, risk detection and remediation.',
      3: 'SCN-003 — Disturbed: Test robustness by injecting synthetic errors based on configured intensities.'
    };
    document.getElementById('scenarioHint').textContent = hints[n];
    
    // Show/hide disturbance controls
    document.getElementById('disturbanceControls').style.display = (n === 3) ? 'block' : 'none';
    
    this.updateSideStatus();
  },

  loadDemo: function() {
    const srow = (i) => {
      const cats = ['IT', 'Logistics', 'Consulting', 'Construction'];
      return {
        supplier_id: 'S' + String(i).padStart(4, '0'),
        category: cats[i % 4],
        financial_rating: (5.8 + ((i * 7) % 42) / 10).toFixed(2),
        compliance_status: i % 17 === 0 ? '' : i % 11 === 0 ? 'Pending' : 'Compliant',
        delivery_reliability: (0.66 + ((i * 3) % 30) / 100).toFixed(3),
        audit_trail_id: i % 9 === 0 ? '' : 'AUD-S-' + i,
        decision_reason: i % 8 === 0 ? '' : 'Supplier profile checked'
      };
    };
    
    const supplierRows = Array.from({ length: 60 }, (_, i) => srow(i + 1));
    supplierRows.push({ ...supplierRows[5] }, { ...supplierRows[10], supplier_id: 'S0011' }); // dupes
    
    const bidRows = Array.from({ length: 42 }, (_, i) => {
      const t = 58 + ((i * 11) % 39), p = 55 + ((i * 13) % 42), e = t * 0.6 + p * 0.4, d = i % 10 === 0 ? 9.5 : i % 14 === 0 ? -7.2 : 0;
      return {
        bid_id: 'B' + String(i + 1).padStart(4, '0'),
        supplier_id: i % 15 === 0 ? 'UNKNOWN-' + i : 'S' + String((i % 60) + 1).padStart(4, '0'),
        technical_score: t.toFixed(1),
        price_score: p.toFixed(1),
        ai_ranking_score: (e + d).toFixed(2), // drift injected
        reviewer_id: i % 6 === 0 ? '' : 'R' + ((i % 5) + 1),
        decision_reason: i % 7 === 0 ? '' : 'Weighted supplier ranking applied'
      };
    });
    
    const perfRows = Array.from({ length: 50 }, (_, i) => ({
      record_id: 'P' + String(i + 1).padStart(4, '0'),
      supplier_id: i % 19 === 0 ? '' : 'S' + String((i % 60) + 1).padStart(4, '0'),
      kpi_score: (62 + ((i * 9) % 37) + (i % 16 === 0 ? 24 : 0)).toFixed(2),
      delivery_performance: (0.67 + ((i * 5) % 29) / 100).toFixed(3),
      quality_rating: (5.3 + ((i * 7) % 42) / 10).toFixed(1),
      audit_trail_id: i % 10 === 0 ? '' : 'AUD-P-' + i
    }));
    
    AppState.uploadedFiles = [
      { name: 'supplier_master.csv', size: 9600, data: { headers: Object.keys(supplierRows[0]), rows: supplierRows } },
      { name: 'tender_evaluation.csv', size: 7800, data: { headers: Object.keys(bidRows[0]), rows: bidRows } },
      { name: 'performance_monitoring.csv', size: 7200, data: { headers: Object.keys(perfRows[0]), rows: perfRows } }
    ];
    
    ScoringModel.addAuditEvent('Info', 'Dataset Ingestion', 'Data Integrity', 'Synthetic demo datasets loaded.', '3 files registered.');
    this.renderFileList();
    this.showPreview(AppState.uploadedFiles[0].data, AppState.uploadedFiles[0].name, 0);
    this.renderColMap();
    this.markDone('upload');
    this.showToast('Demo data loaded — 3 datasets, 152 rows', 'success');
    this.updateSideStatus();
    
    if(document.getElementById('panel-dashboard').classList.contains('active')) {
       this.showPanel('upload');
    }
  },

  runAnalysis: function() {
    if (!AppState.uploadedFiles.length) return this.showToast('Upload files or load demo data first.', 'error');
    const totalW = Object.values(AppState.WEIGHTS).reduce((a,b)=>a+b,0);
    if(totalW !== 100) return this.showToast('Weights must total exactly 100%.', 'error');

    this.showLoading('RUNNING QA EVALUATION…');
    
    setTimeout(() => {
      try {
        const m = this.getMappings();
        const distConfig = {
          missing: parseInt(document.getElementById('dist-missing').value)/100,
          dupes: parseInt(document.getElementById('dist-dupes').value)/100,
          drift: parseInt(document.getElementById('dist-drift').value)/100
        };
        
        const r = ScoringModel.evaluateScenario(AppState.selectedScenario, AppState.uploadedFiles, m, distConfig);
        AppState.lastResults = r;
        this.displayResults(r);
        this.hideLoading();
        this.markDone('configure');
        this.markDone('results');
        this.showPanel('results');
        this.showToast('Evaluation complete — ' + r.scenario_name, 'success');
      } catch (e) {
        this.hideLoading();
        this.showToast('Evaluation failed: ' + e.message, 'error');
        console.error(e);
      }
    }, 350);
  },

  runAllScenarios: function() {
    if (!AppState.uploadedFiles.length) return this.showToast('Upload files or load demo data first.', 'error');
    if (Object.values(AppState.WEIGHTS).reduce((a,b)=>a+b,0) !== 100) return this.showToast('Weights must total exactly 100%.', 'error');
    
    this.showLoading('RUNNING ALL SCENARIOS…');
    setTimeout(() => {
      try {
        const m = this.getMappings();
        const distConfig = {
          missing: parseInt(document.getElementById('dist-missing').value)/100,
          dupes: parseInt(document.getElementById('dist-dupes').value)/100,
          drift: parseInt(document.getElementById('dist-drift').value)/100
        };
        
        const rs = [1, 2, 3].map(s => ScoringModel.evaluateScenario(s, AppState.uploadedFiles, m, distConfig));
        AppState.allScenarioResults = rs;
        AppState.lastResults = rs.find(r => r.scenario === AppState.selectedScenario) || rs[0];
        
        this.displayResults(AppState.lastResults);
        this.displayComparison(rs);
        this.renderAuditLog();
        
        ['configure', 'results', 'comparison', 'audit'].forEach(name => this.markDone(name));
        this.hideLoading();
        this.showPanel('comparison');
        this.showToast('All 3 scenarios evaluated', 'success');
      } catch (e) {
        this.hideLoading();
        this.showToast('Evaluation failed: ' + e.message, 'error');
      }
    }, 400);
  },

  animateValue: function(el, target, suffix = '%', dur = 850) {
    if (!el) return;
    const s = performance.now();
    const tick = now => {
      const t = Math.min((now - s) / dur, 1);
      const e = t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      el.textContent = (target * e).toFixed(1) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },

  // UI Rendering
  displayResults: function(r) {
    document.getElementById('resultsEmpty').style.display = 'none';
    document.getElementById('resultsContent').style.display = 'block';
    
    // Update dashboard score
    const dScore = document.getElementById('dashScore');
    dScore.textContent = r.composite_qa_score.toFixed(1) + '%';
    dScore.className = `mval ${this.scoreClass(r.composite_qa_score, 80)}`;

    document.getElementById('summaryBox').textContent = r.summary;
    
    document.getElementById('metricsGrid').innerHTML = `
      <div class="metric"><div class="mlabel">Composite QA Score</div><div class="mval ${this.scoreClass(r.composite_qa_score, 80)}" id="mv1">—</div></div>
      <div class="metric"><div class="mlabel">Error Reduction</div><div class="mval ${r.error_reduction_rate == null ? 'neutral' : this.scoreClass(r.error_reduction_rate, 30)}" id="mv2">${r.error_reduction_rate == null ? 'N/A' : '—'}</div></div>
      <div class="metric"><div class="mlabel">Risk Detection Rate</div><div class="mval ${this.scoreClass(r.risk_detection_rate, 75)}" id="mv3">—</div></div>
      <div class="metric"><div class="mlabel">Gate Failures</div><div class="mval ${r.quality_gates.some(g => !g.passed) ? 'bad' : 'good'}" style="font-family:'JetBrains Mono',monospace">${r.quality_gates.filter(g => !g.passed).length} / ${r.quality_gates.length}</div></div>
      <div class="metric"><div class="mlabel">Validation Issues</div><div class="mval ${r.profile.recordIssues.length > 10 ? 'bad' : 'warn'}" style="font-family:'JetBrains Mono',monospace">${r.profile.recordIssues.length}</div></div>
    `;
    
    requestAnimationFrame(() => {
      this.animateValue(document.getElementById('mv1'), r.composite_qa_score);
      if (r.error_reduction_rate != null) this.animateValue(document.getElementById('mv2'), r.error_reduction_rate);
      this.animateValue(document.getElementById('mv3'), r.risk_detection_rate);
    });

    // Record Issues
    document.getElementById('recordIssuesBadge').textContent = r.profile.recordIssues.length;
    this.filterRecordIssues(); // populates table

    // Score Breakdown
    document.getElementById('scoreBreakdownBody').innerHTML = r.explanations.map(x => `
      <tr>
        <td><b>${x.attribute}</b></td>
        <td>${x.breakdown.start}%</td>
        <td style="color:var(--redT)">-${x.breakdown.penalties}%</td>
        <td><span class="badge ${this.scoreClass(x.score, 80) === 'good' ? 'bG' : this.scoreClass(x.score, 80) === 'warn' ? 'bW' : 'bD'}">${x.score.toFixed(1)}%</span></td>
      </tr>
    `).join('');

    // Gate Results
    document.getElementById('gateResults').innerHTML = r.quality_gates.map(g => `
      <div class="gate">
        <div><div class="gname">${this.esc(g.gate)}</div><div class="gmeta">Attributes: ${g.attributes.join(', ')}</div></div>
        <b style="font-family:'JetBrains Mono',monospace;font-size:13px">${g.score.toFixed(1)}%</b>
        <span class="small" style="font-family:'JetBrains Mono',monospace">≥ ${g.threshold.toFixed(1)}%</span>
        <span class="badge ${g.passed ? 'bG' : 'bD'}">${g.passed ? 'PASS' : 'FAIL'}</span>
        <div class="gmeta" style="grid-column:1/-1;border-top:1px solid var(--border);padding-top:6px;margin-top:2px">${this.esc(g.action)}</div>
      </div>`).join('');

    // Risk Alerts
    document.getElementById('riskAlerts').innerHTML = r.risk_alerts.length ? r.risk_alerts.map((a, i) => `
      <div class="risk">
        <div class="rhead">
          <span class="rtitle">${this.esc(a.risk)}</span>
          <span class="badge bN" style="font-size:9px">${this.esc(a.phase)}</span>
          <span class="badge ${a.severity === 'High' ? 'bD' : a.severity === 'Medium' ? 'bW' : 'bI'}">${a.severity}</span>
          <button class="btn2 explain-btn" onclick="app.showExplainModal(${i})">Explain AI</button>
        </div>
        <div class="rdetail">${this.esc(a.detail)}</div>
        <div class="raction">↳ ${this.esc(a.action)}</div>
      </div>`).join('') : '<p style="color:var(--tealT);font-size:12px">✓ No risk alerts detected.</p>';

    // Disturbance summary
    if (r.scenario === 3 && AppState.lastDisturbanceSummary) {
       document.getElementById('disturbanceSummaryCard').style.display = 'block';
       const d = AppState.lastDisturbanceSummary;
       document.getElementById('disturbanceSummaryContent').innerHTML = `
        <div class="tablewrap">
         <table>
          <tr><th>Disturbance Type</th><th>Impact</th></tr>
          <tr><td>Missing Data Removal</td><td>${d.missingAffected} cells cleared</td></tr>
          <tr><td>Duplicate Row Injection</td><td>${d.dupeRowsAdded} rows added</td></tr>
          <tr><td>Score/KPI Perturbation</td><td>${d.driftAffected} numeric values altered</td></tr>
         </table>
        </div>
       `;
    } else {
       document.getElementById('disturbanceSummaryCard').style.display = 'none';
    }

    this.renderCharts(r);
    this.renderAuditLog();
  },

  filterRecordIssues: function() {
    if (!AppState.lastResults) return;
    const search = document.getElementById('issueSearch').value.toLowerCase();
    const severity = document.getElementById('issueSeverityFilter').value;
    
    let issues = AppState.lastResults.profile.recordIssues;
    
    if (severity !== 'all') {
      issues = issues.filter(i => i.severity === severity);
    }
    if (search) {
      issues = issues.filter(i => 
        (i.suppId && i.suppId.toLowerCase().includes(search)) || 
        (i.type && i.type.toLowerCase().includes(search)) ||
        (i.field && i.field.toLowerCase().includes(search)) ||
        (i.problem && i.problem.toLowerCase().includes(search))
      );
    }

    const tbody = document.getElementById('recordIssuesBody');
    tbody.innerHTML = issues.slice(0, 100).map(i => `
      <tr>
        <td><span class="badge ${i.severity === 'High' ? 'bD' : i.severity === 'Medium' ? 'bW' : 'bN'}">${i.severity}</span></td>
        <td>${this.esc(i.type)}</td>
        <td>${this.esc(i.dataset)}</td>
        <td class="mono">${i.rowNum}</td>
        <td class="mono">${this.esc(i.suppId)}</td>
        <td class="mono">${this.esc(i.field)}</td>
        <td>${this.esc(i.problem)}</td>
      </tr>
    `).join('') + (issues.length > 100 ? `<tr><td colspan="7" style="text-align:center; color:var(--muted)">Showing 100 of ${issues.length} issues...</td></tr>` : '');
    
    if (issues.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">No issues match filters.</td></tr>';
    }
  },

  showExplainModal: function(riskIndex) {
     if(!AppState.lastResults) return;
     const a = AppState.lastResults.risk_alerts[riskIndex];
     if(!a) return;
     
     document.getElementById('modalTitle').textContent = `AI Explanation: ${a.risk}`;
     
     document.getElementById('modalBody').innerHTML = `
      <div style="margin-bottom: 12px;">
        <span class="badge ${a.severity === 'High' ? 'bD' : a.severity === 'Medium' ? 'bW' : 'bI'}">Severity: ${a.severity}</span>
        <span class="badge bN">Confidence: ${a.confidence}</span>
        <span class="badge bP">Phase: ${a.phase}</span>
      </div>
      
      <h3>Triggering Rule</h3>
      <p style="background:var(--bg3); padding:8px; border-radius:4px; font-family:'JetBrains Mono',monospace;">${this.esc(a.rule)}</p>
      
      <h3>Evidence from Data</h3>
      <p>${this.esc(a.detail)}</p>
      
      <h3>Impact on Model</h3>
      <p>This alert negatively impacts the following quality attributes: <b>${a.affected_attributes.join(', ')}</b>. It may cause quality gates in downstream phases to fail.</p>
      
      <h3>Recommended Corrective Action</h3>
      <p style="color:var(--tealT); font-weight:bold;">${this.esc(a.action)}</p>
     `;
     
     document.getElementById('explainModal').classList.add('show');
  },

  closeModal: function() {
      document.getElementById('explainModal').classList.remove('show');
  },

  renderCharts: function(r) {
    if (!window.Chart) return;
    
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const textColor = isLight ? '#475569' : '#7a8fa8';
    const gridColor = isLight ? 'rgba(15,23,42,0.08)' : 'rgba(120,150,190,.1)';
    const bgOpacity = isLight ? 0.2 : 0.15;
    
    Chart.defaults.color = textColor;
    Chart.defaults.font.family = "'Inter',sans-serif";
    Chart.defaults.font.size = 11;
    
    [radarInstance, gaugeInstance, barInstance].forEach(c => c && c.destroy());
    
    const labels = AppState.ATTRS.map(a => a.label);
    const cur = AppState.ATTRS.map(a => r.quality_attributes[a.key]);
    const ths = AppState.ATTRS.map(a => AppState.THRESHOLDS[a.thKey]);
    
    const base = ScoringModel.evaluateScenario(1, AppState.uploadedFiles, this.getMappings());
    const baseData = AppState.ATTRS.map(a => base.quality_attributes[a.key]);
    
    radarInstance = new Chart(document.getElementById('radarChart'), {
      type: 'radar',
      data: {
        labels,
        datasets: [
          { label: 'Current', data: cur, backgroundColor: `rgba(37,99,235,${bgOpacity})`, borderColor: '#3b82f6', pointBackgroundColor: '#3b82f6', pointRadius: 3, borderWidth: 1.5 },
          { label: 'Threshold', data: ths, backgroundColor: 'rgba(220,38,38,0)', borderColor: 'rgba(220,38,38,.5)', borderDash: [4, 4], pointRadius: 0, borderWidth: 1 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          r: { min: 0, max: 100, ticks: { display: false, stepSize: 20 }, grid: { color: gridColor }, angleLines: { color: gridColor } }
        },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 14 } } }
      }
    });
    
    const color = r.composite_qa_score >= 80 ? '#22c55e' : r.composite_qa_score >= 68 ? '#d97706' : '#dc2626';
    gaugeInstance = new Chart(document.getElementById('gaugeChart'), {
      type: 'doughnut',
      data: {
        labels: ['Score', 'Remaining'],
        datasets: [{ data: [r.composite_qa_score, 100 - r.composite_qa_score], backgroundColor: [color, gridColor], borderWidth: 0, circumference: 270, rotation: 225 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '82%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
      },
      plugins: [{
        id: 'ct',
        beforeDraw(chart) {
          const { width, height, ctx } = chart;
          ctx.save();
          ctx.font = "700 " + height / 8 + "px 'JetBrains Mono',monospace";
          ctx.fillStyle = color;
          ctx.textBaseline = 'middle';
          const text = r.composite_qa_score.toFixed(1) + '%';
          ctx.fillText(text, (width - ctx.measureText(text).width) / 2, height / 2 + 10);
          ctx.restore();
        }
      }]
    });
    
    barInstance = new Chart(document.getElementById('barChart'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'SCN-001 Baseline', data: baseData, backgroundColor: isLight ? 'rgba(148,163,184,.3)' : 'rgba(120,150,190,.25)', borderRadius: 2 },
          { label: 'Selected Scenario', data: cur, backgroundColor: cur.map((v, i) => v >= ths[i] ? 'rgba(22,163,74,.7)' : 'rgba(220,38,38,.7)'), borderRadius: 2 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          y: { min: 0, max: 100, grid: { color: gridColor } },
          x: { grid: { display: false } }
        },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 14 } } }
      }
    });
  },

  displayComparison: function(rs) {
    document.getElementById('comparisonEmpty').style.display = 'none';
    document.getElementById('comparisonContent').style.display = 'block';
    
    if (comparisonInstance) comparisonInstance.destroy();
    
    const gridColor = document.documentElement.getAttribute('data-theme') === 'light' ? 'rgba(15,23,42,0.08)' : 'rgba(120,150,190,.08)';
    
    comparisonInstance = new Chart(document.getElementById('comparisonChart'), {
      type: 'bar',
      data: {
        labels: rs.map(r => 'SCN-00' + r.scenario + ': ' + r.scenario_name),
        datasets: [
          { label: 'Composite QA Score', data: rs.map(r => r.composite_qa_score), backgroundColor: 'rgba(37,99,235,.7)', borderRadius: 3 },
          { label: 'Risk Detection Rate', data: rs.map(r => r.risk_detection_rate), backgroundColor: 'rgba(13,148,136,.7)', borderRadius: 3 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          y: { min: 0, max: 100, grid: { color: gridColor } },
          x: { grid: { display: false } }
        },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 14 } } }
      }
    });
    
    document.getElementById('comparisonTable').innerHTML = `
      <div class="tablewrap">
        <table>
          <thead>
            <tr><th>Indicator</th>${rs.map(r => `<th>SCN-00${r.scenario}</th>`).join('')}</tr>
          </thead>
          <tbody>
            <tr><td>Name</td>${rs.map(r => `<td>${r.scenario_name}</td>`).join('')}</tr>
            <tr><td>Composite QA Score</td>${rs.map(r => `<td class="mono">${r.composite_qa_score.toFixed(1)}%</td>`).join('')}</tr>
            <tr><td>Error Reduction</td>${rs.map(r => `<td class="mono">${r.error_reduction_rate == null ? 'N/A' : r.error_reduction_rate.toFixed(1) + '%'}</td>`).join('')}</tr>
            <tr><td>Risk Detection Rate</td>${rs.map(r => `<td class="mono">${r.risk_detection_rate.toFixed(1)}%</td>`).join('')}</tr>
            <tr><td>Gate Failures</td>${rs.map(r => `<td class="mono">${r.quality_gates.filter(g => !g.passed).length}</td>`).join('')}</tr>
            <tr><td>Risk Alerts</td>${rs.map(r => `<td class="mono">${r.risk_alerts.length}</td>`).join('')}</tr>
          </tbody>
        </table>
      </div>`;
  },

  runSensitivityAnalysis: function() {
    if (!AppState.uploadedFiles.length) return this.showToast('Upload files first.', 'error');
    
    this.showLoading('RUNNING SENSITIVITY MATRIX…');
    setTimeout(() => {
        try {
            const results = ScoringModel.runSensitivityAnalysis(AppState.uploadedFiles, this.getMappings());
            this.displaySensitivity(results);
            this.markDone('sensitivity');
            this.hideLoading();
            this.showToast('Sensitivity analysis complete', 'success');
        } catch(e) {
            this.hideLoading();
            this.showToast('Sensitivity failed: ' + e.message, 'error');
        }
    }, 300);
  },

  displaySensitivity: function(results) {
      document.getElementById('sensitivityEmpty').style.display = 'none';
      document.getElementById('sensitivityContent').style.display = 'block';

      // Table
      document.getElementById('sensitivityBody').innerHTML = results.map(r => `
          <tr>
            <td><b>${this.esc(r.test_case)}</b></td>
            <td class="mono">${r.composite.toFixed(1)}%</td>
            <td class="mono ${r.gate_failures > 0 ? 'bad' : 'good'}">${r.gate_failures}</td>
            <td class="mono">${r.risks}</td>
            <td>${this.esc(r.impact)}</td>
            <td><span class="badge ${r.interpretation.includes('Vulnerable') ? 'bW' : 'bG'}">${this.esc(r.interpretation)}</span></td>
          </tr>
      `).join('');

      // Summary
      const maxFails = Math.max(...results.map(r=>r.gate_failures));
      document.getElementById('gateStabilitySummary').innerHTML = `
        <p style="color:var(--text); line-height: 1.6;">
          The model demonstrates <b>${maxFails > 0 ? 'sensitivity' : 'stability'}</b> across variation parameters. 
          ${maxFails > 0 ? `Max gate failures reached ${maxFails} under strict conditions.` : 'No gate failures were introduced by varying parameters.'}
        </p>
      `;

      // Chart
      if(sensitivityInstance) sensitivityInstance.destroy();
      const gridColor = document.documentElement.getAttribute('data-theme') === 'light' ? 'rgba(15,23,42,0.08)' : 'rgba(120,150,190,.08)';
      
      sensitivityInstance = new Chart(document.getElementById('sensitivityChart'), {
          type: 'line',
          data: {
              labels: results.map(r => r.test_case),
              datasets: [{
                  label: 'Composite Score',
                  data: results.map(r => r.composite),
                  borderColor: '#0d9488',
                  backgroundColor: 'rgba(13,148,136,0.1)',
                  fill: true,
                  tension: 0.3,
                  pointRadius: 4
              }]
          },
          options: {
              responsive: true, maintainAspectRatio: false,
              scales: {
                  y: { min: Math.min(...results.map(r=>r.composite)) - 5, max: 100, grid: {color: gridColor}},
                  x: { grid: {display:false}, ticks: {maxRotation: 45, minRotation: 45} }
              },
              plugins: { legend: {display: false} }
          }
      });
  },

  renderAuditLog: function() {
    this.filterAuditLog(); // Use the filter function to render
  },

  filterAuditLog: function() {
    if (!AppState.auditLog.length) {
      document.getElementById('logEmpty').style.display = 'block';
      document.getElementById('logContent').style.display = 'none';
      return;
    }
    
    document.getElementById('logEmpty').style.display = 'none';
    document.getElementById('logContent').style.display = 'block';
    
    const search = document.getElementById('auditSearch').value.toLowerCase();
    const typeFilter = document.getElementById('auditTypeFilter').value;
    
    let logs = AppState.auditLog;
    
    if(typeFilter !== 'all') {
      logs = logs.filter(l => l.event_type === typeFilter);
    }
    
    if(search) {
      logs = logs.filter(l => 
        (l.event_id && l.event_id.toLowerCase().includes(search)) ||
        (l.detail && l.detail.toLowerCase().includes(search)) ||
        (l.action && l.action.toLowerCase().includes(search)) ||
        (l.attribute && l.attribute.toLowerCase().includes(search))
      );
    }
    
    document.getElementById('logCountBadge').textContent = logs.length + ' events';
    
    const cls = { 'Gate Failure': 'fail', 'Risk Alert': 'riskL', 'Remediation': 'rem', 'Info': 'info', 'Config Change': 'info' };
    
    document.getElementById('logEntries').innerHTML = logs.map((e) => `
      <div class="log ${cls[e.event_type] || 'info'}">
        <div class="lhead">
          <strong>${this.esc(e.event_type)}</strong>
          <span class="badge bN" style="font-size:8px;">${e.event_id}</span>
          ${e.scenario_id ? `<span class="badge bN">${this.esc(e.scenario_id)}</span>` : ''}
          <span class="badge bI">${this.esc(e.phase)}</span>
          <span class="lts">${e.timestamp ? new Date(e.timestamp).toLocaleTimeString('en-GB', { hour12: false }) : ''}</span>
        </div>
        <div class="ldetail"><b>${this.esc(e.attribute)}</b> — ${this.esc(e.detail)}</div>
        <div class="laction">↳ ${this.esc(e.action)}</div>
      </div>`).join('');
      
    this.markDone('audit');
  },

  // Export Wrappers
  downloadJSON: function() { ReportExport.downloadJSON(AppState.lastResults, AppState.auditLog); },
  downloadCSVLog: function() { ReportExport.downloadCSVLog(AppState.auditLog); },
  downloadReport: function(type) { ReportExport.downloadReport(AppState.lastResults, type); },
  downloadTemplate: function() { ReportExport.downloadTemplate(); },

  // Utils
  scoreClass: function(v, thr) { return v >= thr ? 'good' : v >= thr * .85 ? 'warn' : 'bad'; },
  esc: function(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
};

window.addEventListener('load', () => app.init());

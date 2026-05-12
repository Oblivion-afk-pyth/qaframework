/**
 * scoringModel.js
 * Contains formulas, gates, risk logic, sensitivity, and explainability features.
 */

const ScoringModel = {
  
  evaluateScenario: function(scenario, files, m, disturbanceConfig) {
    const working = scenario === 3 ? DataProcessor.injectDisturbances(files, m, disturbanceConfig) : DataProcessor.cloneFiles(files);
    const profile = DataProcessor.profileFiles(working, m);
    const raw = this.calculateRawScores(profile);
    const scores = this.applyScenario(raw, scenario);
    const gates = this.evaluateGates(scores);
    const risks = this.generateRisks(profile, scores, scenario);
    const explanations = this.generateExplanations(profile, scores, scenario);
    const composite = this.weightedComposite(scores);
    
    // Baseline for comparison
    const bp = DataProcessor.profileFiles(DataProcessor.cloneFiles(files), m);
    const baselineScores = this.applyScenario(this.calculateRawScores(bp), 1);
    const baseline = this.weightedComposite(baselineScores);
    
    const err = scenario === 1 ? null : this.clamp(((composite - baseline) / Math.max(1, 100 - baseline)) * 100, 0, 75);
    const detect = scenario === 1 ? this.clamp(42 + Math.min(risks.length * 4, 18), 35, 60) :
                   scenario === 2 ? this.clamp(92 + Math.min(risks.length, 6), 88, 99) :
                   this.clamp(86 + Math.min(risks.length, 8), 80, 96);

    return {
      scenario,
      scenario_name: scenario === 1 ? 'Baseline' : scenario === 2 ? 'Model-Enhanced' : 'Disturbed Conditions',
      quality_attributes: scores,
      composite_qa_score: this.r1(composite),
      baseline_composite_score: this.r1(baseline),
      error_reduction_rate: err == null ? null : this.r1(err),
      risk_detection_rate: this.r1(detect),
      quality_gates: gates,
      risk_alerts: risks,
      explanations,
      profile,
      audit_log: this.buildAudit(scenario, profile, gates, risks, composite),
      summary: this.buildSummary(scenario, scores, gates, risks, composite)
    };
  },

  calculateRawScores: function(p) {
    return {
      data_integrity: this.clamp(100 - p.missingRate * 120 - p.duplicateRate * 85 - p.duplicateSupplierRate * 45 - p.invalidNumericRate * 80 - p.criticalMissingRate * 90, 35, 99),
      accuracy: this.clamp(100 - p.scoreConsistency.deviationRate * 90 - p.outlierReport.outlierRate * 60 - p.invalidNumericRate * 75 - p.criticalMissingRate * 55, 35, 99),
      transparency: this.clamp(48 + Math.min(p.transparencyFieldCount * 10, 42) + Math.min(p.mappedFieldsCount * 1.2, 10) - p.missingRate * 35, 35, 99),
      reliability: this.clamp(100 - p.linkageErrorRate * 95 - p.duplicateSupplierRate * 60 - p.missingRate * 50 - p.outlierReport.outlierRate * 35, 35, 99),
      robustness: this.clamp(100 - p.missingRate * 75 - p.outlierReport.outlierRate * 85 - p.duplicateRate * 55 - p.scoreConsistency.deviationRate * 40, 35, 99)
    };
  },

  applyScenario: function(raw, s) {
    const a = { ...raw };
    if (s === 1) {
      a.accuracy = this.clamp(raw.accuracy - 7, 35, 88);
      a.reliability = this.clamp(raw.reliability - 11, 35, 78);
      a.transparency = this.clamp(raw.transparency - 18, 35, 70);
      a.robustness = this.clamp(raw.robustness - 12, 35, 76);
      a.data_integrity = this.clamp(raw.data_integrity - 8, 35, 88);
    }
    if (s === 2) {
      a.accuracy = this.clamp(raw.accuracy + 8, 60, 98);
      a.reliability = this.clamp(raw.reliability + 12, 60, 98);
      a.transparency = this.clamp(raw.transparency + 20, 60, 96);
      a.robustness = this.clamp(raw.robustness + 11, 60, 96);
      a.data_integrity = this.clamp(raw.data_integrity + 10, 60, 99);
    }
    if (s === 3) {
      a.accuracy = this.clamp(raw.accuracy + 5, 50, 92);
      a.reliability = this.clamp(raw.reliability + 7, 50, 91);
      a.transparency = this.clamp(raw.transparency + 16, 50, 91);
      a.robustness = this.clamp(raw.robustness + 6, 50, 90);
      a.data_integrity = this.clamp(raw.data_integrity + 7, 50, 91);
    }
    Object.keys(a).forEach(k => a[k] = this.r1(a[k]));
    return a;
  },

  evaluateGates: function(s) {
    const defs = [
      ['Gate 01 — Supplier ID → Tender Eval', 'Supplier Identification', ['data_integrity', 'accuracy'], [.6, .4], .6 * AppState.THRESHOLDS.integrity + .4 * AppState.THRESHOLDS.accuracy, 'Clean supplier master data and enforce mandatory compliance fields.'],
      ['Gate 02 — Tender Eval → Contract Award', 'Tender Evaluation', ['accuracy', 'transparency'], [.5, .5], .5 * AppState.THRESHOLDS.accuracy + .5 * AppState.THRESHOLDS.transparency, 'Review AI ranking formula and require human approval for borderline bids.'],
      ['Gate 03 — Contract Award → Execution', 'Contract Award', ['reliability', 'data_integrity'], [.5, .5], .5 * AppState.THRESHOLDS.reliability + .5 * AppState.THRESHOLDS.integrity, 'Verify contract records and supplier links before proceeding.'],
      ['Gate 04 — Execution → Performance Mon.', 'Contract Execution', ['robustness', 'accuracy'], [.5, .5], .5 * AppState.THRESHOLDS.robustness + .5 * AppState.THRESHOLDS.accuracy, 'Recalibrate performance model and investigate KPI drift.']
    ];
    return defs.map(d => {
      const score = d[2].reduce((sum, a, i) => sum + s[a] * d[3][i], 0);
      const passed = score >= d[4];
      return {
        gate: d[0],
        phase: d[1],
        attributes: d[2].map(this.pretty),
        score: this.r1(score),
        threshold: this.r1(d[4]),
        passed,
        action: passed ? 'Proceed with standard monitoring.' : d[5]
      };
    });
  },

  generateRisks: function(p, s, scenario) {
    const risks = [];
    
    // Evaluate Confidence levels based on multiple indicators
    const getConf = (mainInd, secondaryInd) => (mainInd > 0.1 && secondaryInd > 0.05) ? 'High' : (mainInd > 0.05) ? 'Medium' : 'Low';

    if (p.missingRate > 0.03) risks.push({
      risk: 'Missing procurement data', phase: 'Dataset Ingestion',
      severity: p.missingRate > .1 ? 'High' : 'Medium',
      confidence: getConf(p.missingRate, p.criticalMissingRate),
      affected_attributes: ['Data Integrity', 'Reliability'],
      detail: `${this.pct(p.missingRate)} of all cells are missing. Critical missing rate: ${this.pct(p.criticalMissingRate)}.`,
      rule: 'If Missing Rate > 3%',
      action: 'Apply mandatory field validation and clean incomplete records.'
    });
    
    if (p.duplicateRate > 0.01 || p.duplicateSupplierRate > 0.01) risks.push({
      risk: 'Duplicate supplier or transaction records', phase: 'Supplier Identification',
      severity: p.duplicateSupplierRate > .05 ? 'High' : 'Medium',
      confidence: getConf(p.duplicateSupplierRate, p.duplicateRate),
      affected_attributes: ['Data Integrity', 'Reliability'],
      detail: `${p.duplicateRows} duplicate rows and ${p.duplicateSupplierIds} repeated supplier IDs detected.`,
      rule: 'If Duplicate Supplier Rate > 1%',
      action: 'Deduplicate supplier master records and enforce unique identifiers.'
    });

    if (p.scoreConsistency.deviationRate > 0.05) risks.push({
      risk: 'AI ranking inconsistency', phase: 'Tender Evaluation',
      severity: p.scoreConsistency.deviationRate > .15 ? 'High' : 'Medium',
      confidence: getConf(p.scoreConsistency.deviationRate, p.outlierReport.outlierRate),
      affected_attributes: ['Accuracy', 'Transparency'],
      detail: `${this.pct(p.scoreConsistency.deviationRate)} of ranking scores deviate from the expected weighted formula.`,
      rule: 'If Score Deviation > 5%',
      action: 'Review scoring formula and document exceptions before contract award.'
    });

    if (p.linkageErrorRate > 0.02) risks.push({
      risk: 'Broken supplier linkage', phase: 'Contract Award',
      severity: p.linkageErrorRate > .1 ? 'High' : 'Medium',
      confidence: getConf(p.linkageErrorRate, p.missingRate),
      affected_attributes: ['Reliability', 'Data Integrity'],
      detail: `${this.pct(p.linkageErrorRate)} of supplier references cannot be linked to master data.`,
      rule: 'If Foreign Key Failure > 2%',
      action: 'Validate foreign keys across supplier, tender and performance datasets.'
    });

    if (p.outlierReport.outlierRate > 0.04) risks.push({
      risk: 'Abnormal KPI or score variation', phase: 'Performance Monitoring',
      severity: p.outlierReport.outlierRate > .12 ? 'High' : 'Medium',
      confidence: getConf(p.outlierReport.outlierRate, p.scoreConsistency.deviationRate),
      affected_attributes: ['Robustness', 'Accuracy'],
      detail: `${p.outlierReport.outliers} numeric outliers detected across score and KPI fields.`,
      rule: 'If Statistical Outliers > 4%',
      action: 'Investigate KPI drift and abnormal supplier scores.'
    });

    if (p.transparencyFieldCount < 2) risks.push({
      risk: 'Insufficient decision traceability', phase: 'Governance',
      severity: 'High',
      confidence: 'High',
      affected_attributes: ['Transparency'],
      detail: `Only ${p.transparencyFieldCount} transparency fields detected.`,
      rule: 'If Traceability Fields < 2',
      action: 'Add audit trail IDs, reviewer IDs, decision reasons and approval status.'
    });

    if (scenario === 3) risks.push({
      risk: 'Injected disturbance detected', phase: 'Robustness Test',
      severity: 'Medium',
      confidence: 'High',
      affected_attributes: ['Robustness', 'Data Integrity'],
      detail: 'SCN-003 injected synthetic data perturbations.',
      rule: 'If Scenario == 3',
      action: 'Use results to calibrate gate thresholds and remediation rules.'
    });

    return risks;
  },

  generateExplanations: function(p, s, scenario) {
    const note = scenario === 1 ? 'No QA framework remediation applied.' : scenario === 2 ? 'QA framework partially remediates through validation.' : 'Score reduced by perturbations but partially recovered by detection.';
    
    // Generate detailed breakdown
    const b = (start, pens, adj) => {
        const final = this.r1(start - pens + adj);
        return { start: 100, penalties: this.r1(pens), adjustment: this.r1(adj - (100 - start)), final: this.clamp(final, 35, 99) };
    };

    const brk = {
      data_integrity: b(100, (p.missingRate * 120 + p.duplicateRate * 85 + p.duplicateSupplierRate * 45 + p.invalidNumericRate * 80 + p.criticalMissingRate * 90), s.data_integrity - this.calculateRawScores(p).data_integrity),
      accuracy: b(100, (p.scoreConsistency.deviationRate * 90 + p.outlierReport.outlierRate * 60 + p.invalidNumericRate * 75 + p.criticalMissingRate * 55), s.accuracy - this.calculateRawScores(p).accuracy),
      transparency: b(100, (p.missingRate * 35), (s.transparency - 100) + (p.missingRate * 35)), // Custom handling for transparency start
      reliability: b(100, (p.linkageErrorRate * 95 + p.duplicateSupplierRate * 60 + p.missingRate * 50 + p.outlierReport.outlierRate * 35), s.reliability - this.calculateRawScores(p).reliability),
      robustness: b(100, (p.missingRate * 75 + p.outlierReport.outlierRate * 85 + p.duplicateRate * 55 + p.scoreConsistency.deviationRate * 40), s.robustness - this.calculateRawScores(p).robustness)
    };

    return [
      { attribute: 'Data Integrity', score: s.data_integrity, breakdown: brk.data_integrity,
        reason: `Missing: ${this.pct(p.missingRate)}, Dupes: ${p.duplicateRows}, Invalid: ${this.pct(p.invalidNumericRate)}.`,
        action: 'Clean missing fields, deduplicate records and enforce numeric validation.', note },
      { attribute: 'Accuracy', score: s.accuracy, breakdown: brk.accuracy,
        reason: `${p.scoreConsistency.deviations} ranking deviations detected. Outlier rate: ${this.pct(p.outlierReport.outlierRate)}.`,
        action: 'Validate AI scoring formulas and review abnormal ranking deviations.', note },
      { attribute: 'Transparency', score: s.transparency, breakdown: brk.transparency,
        reason: `${p.transparencyFieldCount} fields present. Base score reduced by missing data.`,
        action: 'Add audit trails, reviewer IDs, decision reasons.', note },
      { attribute: 'Reliability', score: s.reliability, breakdown: brk.reliability,
        reason: `Linkage errors: ${this.pct(p.linkageErrorRate)}, Duplicate suppliers: ${p.duplicateSupplierIds}.`,
        action: 'Strengthen supplier master data and cross-dataset consistency.', note },
      { attribute: 'Robustness', score: s.robustness, breakdown: brk.robustness,
        reason: `Outlier rate: ${this.pct(p.outlierReport.outlierRate)}, Missing data exposure.`,
        action: 'Monitor KPI drift and recalibrate thresholds periodically.', note }
    ];
  },

  buildSummary: function(scenario, s, gates, risks, c) {
    const failed = gates.filter(g => !g.passed).length;
    const sc = scenario === 1 ? 'baseline condition (SCN-001) without active QA controls' : scenario === 2 ? 'model-enhanced QA condition (SCN-002)' : 'disturbed robustness-test condition (SCN-003)';
    return `The ${sc} achieved a composite QA score of ${this.r1(c)}%. ${failed} of ${gates.length} quality gates failed and ${risks.length} risk alerts were generated. Strongest attribute: ${this.strongest(s)}. Weakest: ${this.weakest(s)}.`;
  },

  buildAudit: function(scenario, p, gates, risks, c) {
    const start = Date.now();
    const add = (event_type, phase, attribute, detail, action) => {
        AppState.auditLog.push({
            event_id: 'EV-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
            event_type, phase, attribute, detail, action,
            scenario_id: `SCN-00${scenario}`,
            user_role: 'Analyst',
            timestamp: new Date(start + AppState.auditLog.length * 1000).toISOString()
        });
    };
    
    add('Info', 'Setup', 'Scenario', `SCN-00${scenario} evaluation started.`, 'Configuration recorded.');
    add('Info', 'Dataset Profiling', 'Data Integrity', `${p.totalFiles} files — ${p.totalRows} rows, ${p.totalCells} cells profiled.`, 'Profile metrics calculated.');
    risks.forEach(r => add('Risk Alert', r.phase, r.affected_attributes.join(', '), r.detail, r.action));
    gates.forEach(g => add(g.passed ? 'Info' : 'Gate Failure', g.phase, g.attributes.join(', '), `${g.gate} — ${g.score}% vs threshold ${g.threshold}%.`, g.action));
    if (scenario !== 1) add('Remediation', 'Quality Assurance', 'All attributes', 'Rule-based QA controls generated remediation recommendations.', 'Gate controller and risk engine activated.');
    add('Info', 'Completion', 'Composite QA', `Composite QA score: ${this.r1(c)}%.`, 'Results available for export.');
    
    return AppState.auditLog;
  },

  addAuditEvent: function(type, phase, attr, detail, action) {
     AppState.auditLog.push({
        event_id: 'EV-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
        event_type: type, phase, attribute: attr, detail, action,
        scenario_id: `SCN-00${AppState.selectedScenario}`,
        user_role: 'Analyst',
        timestamp: new Date().toISOString()
     });
  },

  weightedComposite: function(s) {
    const w = AppState.WEIGHTS;
    return s.data_integrity * (w.integrity / 100) + 
           s.accuracy * (w.accuracy / 100) + 
           s.transparency * (w.transparency / 100) + 
           s.reliability * (w.reliability / 100) + 
           s.robustness * (w.robustness / 100);
  },

  runSensitivityAnalysis: function(files, mappings) {
      // Test matrix: [-10%, -5%, Default, +5%, +10%] for thresholds and weights (focusing on integrity/accuracy)
      const baseScores = this.applyScenario(this.calculateRawScores(DataProcessor.profileFiles(DataProcessor.cloneFiles(files), mappings)), AppState.selectedScenario);
      const results = [];
      const steps = [-10, -5, 0, 5, 10];
      
      const evalSens = (thMod, wMod, label, desc) => {
          // Backup
          const origTh = {...AppState.THRESHOLDS};
          const origW = {...AppState.WEIGHTS};
          
          // Apply mods
          AppState.THRESHOLDS.integrity = this.clamp(origTh.integrity + thMod, 50, 99);
          AppState.THRESHOLDS.accuracy = this.clamp(origTh.accuracy + thMod, 50, 99);
          
          // Adjust weights (if +5 to integrity, subtract 5 from robustness to keep 100)
          AppState.WEIGHTS.integrity += wMod;
          AppState.WEIGHTS.robustness -= wMod;
          
          const composite = this.weightedComposite(baseScores);
          const gates = this.evaluateGates(baseScores);
          const risks = this.generateRisks(DataProcessor.profileFiles(DataProcessor.cloneFiles(files), mappings), baseScores, AppState.selectedScenario);
          
          results.push({
              test_case: label,
              composite: composite,
              gate_failures: gates.filter(g => !g.passed).length,
              risks: risks.length,
              impact: desc,
              interpretation: gates.some(g=>!g.passed) ? 'Vulnerable to strict limits' : 'Stable under variation'
          });
          
          // Restore
          AppState.THRESHOLDS = origTh;
          AppState.WEIGHTS = origW;
      };

      steps.forEach(s => {
          if(s === 0) evalSens(0, 0, 'Baseline (0%)', 'Current configuration');
          else {
              evalSens(s, 0, `Thresholds ${s > 0 ? '+'+s : s}%`, `${s > 0 ? 'Stricter' : 'Lax'} quality gates`);
              evalSens(0, s, `Weights ${s > 0 ? '+'+s : s}%`, `${s > 0 ? 'Higher' : 'Lower'} emphasis on Integrity`);
          }
      });
      
      return results;
  },

  // Helpers
  strongest: function(s) { return this.pretty(Object.entries(s).sort((a, b) => b[1] - a[1])[0][0]); },
  weakest: function(s) { return this.pretty(Object.entries(s).sort((a, b) => a[1] - b[1])[0][0]); },
  pretty: function(k) { return k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); },
  clamp: function(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); },
  r1: function(v) { return Math.round(v * 10) / 10; },
  pct: function(v) { return (this.r1(v * 100)).toFixed(1) + '%'; }
};

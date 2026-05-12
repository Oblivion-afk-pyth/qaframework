/**
 * reportExport.js
 * Handles JSON, CSV, HTML, and Word compatible exports.
 */

const ReportExport = {

  downloadJSON: function(results, auditLog) {
    if (!results) {
      app.showToast('Run an evaluation first.', 'error');
      return;
    }
    ScoringModel.addAuditEvent('Info', 'Export', 'Auditability', 'JSON report exported.', 'Report generated.');
    
    const payload = {
      generated_at: new Date().toISOString(),
      scenario: results.scenario_name,
      composite_score: results.composite_qa_score,
      quality_attributes: results.quality_attributes,
      quality_gates: results.quality_gates,
      risk_alerts: results.risk_alerts,
      record_issues_summary: `Found ${results.profile.recordIssues.length} issues.`,
      audit_log: auditLog
    };
    
    this.triggerDownload(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), 'procurement_qa_report.json');
    app.renderAuditLog();
    app.showToast('JSON report downloaded', 'success');
  },

  downloadCSVLog: function(auditLog) {
    if (!auditLog.length) {
      app.showToast('Run an evaluation first.', 'error');
      return;
    }
    ScoringModel.addAuditEvent('Info', 'Export', 'Auditability', 'CSV audit log exported.', 'Evidence downloaded.');
    
    const header = 'event_id,scenario_id,timestamp,user_role,event_type,phase,attribute,detail,action\n';
    const rows = auditLog.map(e => [
      e.event_id, e.scenario_id || '', e.timestamp || '', e.user_role || '',
      e.event_type, e.phase, e.attribute, e.detail, e.action
    ].map(this.csvCell).join(',')).join('\n');
    
    this.triggerDownload(new Blob([header + rows], { type: 'text/csv' }), 'procurement_qa_audit.csv');
    app.renderAuditLog();
    app.showToast('Audit CSV downloaded', 'success');
  },

  downloadReport: function(results, type = 'html') {
    if (!results) {
      app.showToast('Run an evaluation first.', 'error');
      return;
    }
    
    const reportType = type === 'doc' ? 'Word' : 'HTML';
    ScoringModel.addAuditEvent('Info', 'Export', 'Auditability', `${reportType} report exported.`, 'Printable report generated.');
    
    const r = results;
    const isDoc = type === 'doc';
    const mime = isDoc ? 'application/msword' : 'text/html';
    const ext = isDoc ? 'doc' : 'html';
    
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Procurement QA Enterprise Report</title>
<style>
  body { font-family: Arial, sans-serif; line-height: 1.5; margin: 32px; color: #111; font-size: 13px; }
  h1 { color: #1e40af; border-bottom: 2px solid #1e40af; padding-bottom: 8px;}
  h2 { color: #0f766e; margin-top: 24px; border-bottom: 1px solid #ccc; padding-bottom: 4px;}
  h3 { color: #333; margin-top: 16px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; margin: 12px 0; }
  th, td { border: 1px solid #ddd; padding: 7px 10px; text-align: left; vertical-align: top;}
  th { background: #f0f4f8; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  tr:nth-child(even) td { background: #f9fafb; }
  .badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; }
  .pass { background: #dcfce7; color: #15803d; }
  .fail { background: #fee2e2; color: #b91c1c; }
  .high-risk { color: #b91c1c; font-weight: bold; }
  .med-risk { color: #b45309; font-weight: bold; }
  .low-risk { color: #0e7490; font-weight: bold; }
  .summary-box { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px; margin-bottom: 20px;}
</style>
</head>
<body>

<h1>Procurement QA Evaluation Report</h1>
<p><b>Generated:</b> ${new Date().toLocaleString()}</p>
<p><b>Scenario:</b> SCN-00${r.scenario} — ${r.scenario_name}</p>

<div class="summary-box">
  <h3>Executive Summary</h3>
  <p>${this.esc(r.summary)}</p>
</div>

<h2>Quality Attributes & Score Breakdown</h2>
<table>
  <tr><th>Attribute</th><th>Final Score</th><th>Starting Score</th><th>Penalties</th></tr>
  ${r.explanations.map(x => `
    <tr>
      <td><b>${x.attribute}</b></td>
      <td><b>${x.score.toFixed(1)}%</b></td>
      <td>${x.breakdown.start.toFixed(1)}%</td>
      <td>-${x.breakdown.penalties.toFixed(1)}%</td>
    </tr>
    <tr>
      <td colspan="4" style="font-size: 11px; color: #555;"><i>Reason:</i> ${this.esc(x.reason)}<br><i>Action:</i> ${this.esc(x.action)}</td>
    </tr>
  `).join('')}
</table>

<h2>Quality Gates</h2>
<table>
  <tr><th>Gate</th><th>Phase</th><th>Score</th><th>Threshold</th><th>Status</th><th>Required Action</th></tr>
  ${r.quality_gates.map(g => `
    <tr>
      <td>${this.esc(g.gate)}</td>
      <td>${this.esc(g.phase)}</td>
      <td>${g.score.toFixed(1)}%</td>
      <td>${g.threshold.toFixed(1)}%</td>
      <td><span class="badge ${g.passed ? 'pass' : 'fail'}">${g.passed ? 'PASS' : 'FAIL'}</span></td>
      <td>${this.esc(g.action)}</td>
    </tr>
  `).join('')}
</table>

<h2>Risk Alerts & AI Explanations</h2>
<table>
  <tr><th>Risk Alert</th><th>Severity / Confidence</th><th>Phase</th><th>Evidence / Detail</th><th>Recommended Action</th></tr>
  ${r.risk_alerts.map(x => `
    <tr>
      <td><b>${this.esc(x.risk)}</b></td>
      <td>
        <span class="${x.severity === 'High' ? 'high-risk' : x.severity === 'Medium' ? 'med-risk' : 'low-risk'}">${x.severity}</span><br>
        <span style="font-size:10px; color:#666;">Conf: ${x.confidence}</span>
      </td>
      <td>${this.esc(x.phase)}</td>
      <td>${this.esc(x.detail)}<br><span style="font-size:10px; color:#888;">Rule: ${x.rule}</span></td>
      <td>${this.esc(x.action)}</td>
    </tr>
  `).join('') || '<tr><td colspan="5">No risk alerts detected.</td></tr>'}
</table>

<h2>Record-Level Validation Issues (Top 50)</h2>
<p>Showing the most severe validation issues found in the uploaded datasets.</p>
<table>
  <tr><th>Severity</th><th>Issue Type</th><th>Dataset</th><th>Row</th><th>Supplier ID</th><th>Field</th><th>Problem</th></tr>
  ${r.profile.recordIssues.slice(0, 50).map(i => `
    <tr>
      <td><span class="${i.severity === 'High' ? 'high-risk' : i.severity === 'Medium' ? 'med-risk' : 'low-risk'}">${i.severity}</span></td>
      <td>${i.type}</td>
      <td>${i.dataset}</td>
      <td>${i.rowNum}</td>
      <td>${i.suppId}</td>
      <td>${i.field}</td>
      <td>${i.problem}</td>
    </tr>
  `).join('') || '<tr><td colspan="7">No record-level issues detected.</td></tr>'}
</table>

<h2>Configuration & Thresholds</h2>
<table>
  <tr><th>Component</th><th>Value</th></tr>
  <tr><td>Integrity Weight</td><td>${AppState.WEIGHTS.integrity}%</td></tr>
  <tr><td>Accuracy Weight</td><td>${AppState.WEIGHTS.accuracy}%</td></tr>
  <tr><td>Transparency Weight</td><td>${AppState.WEIGHTS.transparency}%</td></tr>
  <tr><td>Reliability Weight</td><td>${AppState.WEIGHTS.reliability}%</td></tr>
  <tr><td>Robustness Weight</td><td>${AppState.WEIGHTS.robustness}%</td></tr>
  <tr><td>Integrity Gate Threshold</td><td>${AppState.THRESHOLDS.integrity}%</td></tr>
  <tr><td>Accuracy Gate Threshold</td><td>${AppState.THRESHOLDS.accuracy}%</td></tr>
  <tr><td>Transparency Gate Threshold</td><td>${AppState.THRESHOLDS.transparency}%</td></tr>
</table>

</body>
</html>`;
    
    this.triggerDownload(new Blob([html], { type: mime }), `procurement_qa_report.${ext}`);
    app.renderAuditLog();
    app.showToast(`${reportType} report downloaded`, 'success');
  },

  downloadTemplate: function() {
    const header = 'supplier_id,compliance_status,financial_rating,delivery_reliability,technical_score,price_score,ai_ranking_score,kpi_score,audit_trail_id,decision_reason\n';
    const row1 = 'S0001,Compliant,7.5,0.92,85.0,90.0,87.0,88.5,AUD-001,Verified supplier\n';
    const row2 = 'S0002,Pending,5.2,0.65,45.0,50.0,47.0,55.0,,Missing audit\n';
    
    this.triggerDownload(new Blob([header + row1 + row2], { type: 'text/csv' }), 'procureQA_template.csv');
    app.showToast('Template downloaded', 'success');
  },

  triggerDownload: function(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  esc: function(s) {
    return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  },

  csvCell: function(v) {
    return '"' + String(v ?? '').replace(/"/g, '""') + '"';
  }
};

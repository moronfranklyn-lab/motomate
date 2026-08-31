const { mkdirSync } = require("node:fs");
const { dirname } = require("node:path");
const { spawnSync } = require("node:child_process");

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonValue(value) {
  return sqlValue(JSON.stringify(value));
}

function createSqliteStore(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true });

  function execute(sql, options = {}) {
    const args = options.json ? ["-json", databasePath] : [databasePath];
    const result = spawnSync("sqlite3", args, {
      input: sql,
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
    });
    if (result.status !== 0) throw new Error(`sqlite_error:${result.stderr.trim()}`);
    if (!options.json) return null;
    return result.stdout.trim() ? JSON.parse(result.stdout) : [];
  }

  execute(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      needs_json TEXT NOT NULL,
      critical_question_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS recommendation_versions (
      recommendation_version_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      run_mode TEXT NOT NULL,
      pool_version TEXT NOT NULL,
      rule_version TEXT NOT NULL,
      needs_snapshot_json TEXT NOT NULL,
      candidate_model_ids_json TEXT NOT NULL,
      closest_candidate_model_ids_json TEXT NOT NULL,
      status TEXT NOT NULL,
      UNIQUE(session_id, version_number)
    );
    CREATE TABLE IF NOT EXISTS feedback (
      feedback_id TEXT PRIMARY KEY,
      recommendation_version_id TEXT NOT NULL UNIQUE REFERENCES recommendation_versions(recommendation_version_id) ON DELETE CASCADE,
      submitted_at TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      help_tags_json TEXT NOT NULL,
      failure_reasons_json TEXT NOT NULL,
      comment TEXT,
      success_sample INTEGER NOT NULL CHECK(success_sample IN (0, 1))
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      event_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
      occurred_at TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_versions_session ON recommendation_versions(session_id, version_number);
    CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_events(session_id, occurred_at);
  `);

  function getSession(sessionId) {
    const sessions = execute(`SELECT * FROM sessions WHERE session_id=${sqlValue(sessionId)};`, { json: true });
    if (sessions.length === 0) return null;
    const row = sessions[0];
    const versionRows = execute(`
      SELECT rv.*, f.feedback_id, f.submitted_at, f.rating, f.help_tags_json,
             f.failure_reasons_json, f.comment, f.success_sample
      FROM recommendation_versions rv
      LEFT JOIN feedback f ON f.recommendation_version_id=rv.recommendation_version_id
      WHERE rv.session_id=${sqlValue(sessionId)}
      ORDER BY rv.version_number;
    `, { json: true });
    const auditRows = execute(`SELECT event_json FROM audit_events WHERE session_id=${sqlValue(sessionId)} ORDER BY occurred_at, rowid;`, { json: true });
    return {
      needs: JSON.parse(row.needs_json),
      critical_question_count: row.critical_question_count,
      recommendation_versions: versionRows.map((version) => ({
        recommendation_version_id: version.recommendation_version_id,
        session_id: version.session_id,
        version_number: version.version_number,
        created_at: version.created_at,
        run_mode: version.run_mode,
        pool_version: version.pool_version,
        rule_version: version.rule_version,
        needs_snapshot: JSON.parse(version.needs_snapshot_json),
        candidate_model_ids: JSON.parse(version.candidate_model_ids_json),
        closest_candidate_model_ids: JSON.parse(version.closest_candidate_model_ids_json),
        status: version.status,
        feedback: version.feedback_id ? {
          feedback_id: version.feedback_id,
          submitted_at: version.submitted_at,
          rating: version.rating,
          help_tags: JSON.parse(version.help_tags_json),
          failure_reasons: JSON.parse(version.failure_reasons_json),
          comment: version.comment ?? null,
          success_sample: version.success_sample === 1,
        } : null,
      })),
      audit_events: auditRows.map((event) => JSON.parse(event.event_json)),
    };
  }

  function saveRun(sessionId, session, event, recommendationVersion) {
    const now = new Date().toISOString();
    execute(`
      PRAGMA foreign_keys=ON;
      BEGIN IMMEDIATE;
      INSERT INTO sessions(session_id, needs_json, critical_question_count, created_at, updated_at)
      VALUES(${sqlValue(sessionId)}, ${jsonValue(session.needs)}, ${session.critical_question_count}, ${sqlValue(now)}, ${sqlValue(now)})
      ON CONFLICT(session_id) DO UPDATE SET
        needs_json=excluded.needs_json,
        critical_question_count=excluded.critical_question_count,
        updated_at=excluded.updated_at;
      INSERT INTO audit_events(event_id, session_id, occurred_at, event_type, event_json)
      VALUES(${sqlValue(event.event_id)}, ${sqlValue(sessionId)}, ${sqlValue(event.occurred_at)}, ${sqlValue(event.event_type)}, ${jsonValue(event)});
      ${recommendationVersion ? `INSERT INTO recommendation_versions(
        recommendation_version_id, session_id, version_number, created_at, run_mode,
        pool_version, rule_version, needs_snapshot_json, candidate_model_ids_json,
        closest_candidate_model_ids_json, status
      ) VALUES(
        ${sqlValue(recommendationVersion.recommendation_version_id)}, ${sqlValue(sessionId)}, ${recommendationVersion.version_number},
        ${sqlValue(recommendationVersion.created_at)}, ${sqlValue(recommendationVersion.run_mode)}, ${sqlValue(recommendationVersion.pool_version)},
        ${sqlValue(recommendationVersion.rule_version)}, ${jsonValue(recommendationVersion.needs_snapshot)},
        ${jsonValue(recommendationVersion.candidate_model_ids)}, ${jsonValue(recommendationVersion.closest_candidate_model_ids)},
        ${sqlValue(recommendationVersion.status)}
      );` : ""}
      COMMIT;
    `);
  }

  function saveFeedback(sessionId, recommendationVersionId, feedback, event) {
    execute(`
      PRAGMA foreign_keys=ON;
      BEGIN IMMEDIATE;
      INSERT INTO feedback(
        feedback_id, recommendation_version_id, submitted_at, rating,
        help_tags_json, failure_reasons_json, comment, success_sample
      ) VALUES(
        ${sqlValue(feedback.feedback_id)}, ${sqlValue(recommendationVersionId)}, ${sqlValue(feedback.submitted_at)},
        ${feedback.rating}, ${jsonValue(feedback.help_tags)}, ${jsonValue(feedback.failure_reasons)},
        ${sqlValue(feedback.comment)}, ${feedback.success_sample ? 1 : 0}
      );
      INSERT INTO audit_events(event_id, session_id, occurred_at, event_type, event_json)
      VALUES(${sqlValue(event.event_id)}, ${sqlValue(sessionId)}, ${sqlValue(event.occurred_at)}, ${sqlValue(event.event_type)}, ${jsonValue(event)});
      COMMIT;
    `);
  }

  function getFeedbackSummary() {
    const totals = execute(`
      SELECT
        (SELECT COUNT(*) FROM recommendation_versions) AS recommendation_version_count,
        COUNT(*) AS feedback_count,
        COALESCE(ROUND(AVG(rating), 2), 0) AS average_rating,
        COALESCE(SUM(success_sample), 0) AS success_sample_count
      FROM feedback;
    `, { json: true })[0];
    const feedbackRows = execute(`
      SELECT f.feedback_id, f.submitted_at, f.rating, f.help_tags_json,
             f.failure_reasons_json, f.comment, f.success_sample,
             rv.version_number, rv.pool_version, rv.candidate_model_ids_json
      FROM feedback f
      JOIN recommendation_versions rv
        ON rv.recommendation_version_id=f.recommendation_version_id
      ORDER BY f.submitted_at DESC, f.rowid DESC;
    `, { json: true });
    const ratingDistribution = Object.fromEntries([1, 2, 3, 4, 5].map((rating) => [rating, 0]));
    const helpTags = {};
    const failureReasons = {};
    for (const row of feedbackRows) {
      ratingDistribution[row.rating] += 1;
      for (const tag of JSON.parse(row.help_tags_json)) helpTags[tag] = (helpTags[tag] || 0) + 1;
      for (const reason of JSON.parse(row.failure_reasons_json)) failureReasons[reason] = (failureReasons[reason] || 0) + 1;
    }
    const versionCount = totals.recommendation_version_count;
    const feedbackCount = totals.feedback_count;
    return {
      generated_at: new Date().toISOString(),
      recommendation_version_count: versionCount,
      feedback_count: feedbackCount,
      feedback_coverage_rate: versionCount === 0 ? 0 : Number((feedbackCount / versionCount).toFixed(3)),
      average_rating: totals.average_rating,
      success_sample_count: totals.success_sample_count,
      success_sample_rate: feedbackCount === 0 ? 0 : Number((totals.success_sample_count / feedbackCount).toFixed(3)),
      rating_distribution: ratingDistribution,
      help_tag_counts: helpTags,
      failure_reason_counts: failureReasons,
      recent_feedback: feedbackRows.slice(0, 20).map((row) => ({
        feedback_id: row.feedback_id,
        submitted_at: row.submitted_at,
        rating: row.rating,
        help_tags: JSON.parse(row.help_tags_json),
        failure_reasons: JSON.parse(row.failure_reasons_json),
        comment: row.comment ?? null,
        success_sample: row.success_sample === 1,
        recommendation_version_number: row.version_number,
        pool_version: row.pool_version,
        candidate_model_ids: JSON.parse(row.candidate_model_ids_json),
      })),
    };
  }

  return { databasePath, getSession, saveRun, saveFeedback, getFeedbackSummary };
}

module.exports = { createSqliteStore };

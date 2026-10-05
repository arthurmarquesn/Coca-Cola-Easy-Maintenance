-- Apply before deploying login throttling. Contains no user data changes.
CREATE TABLE IF NOT EXISTS login_attempts (
  account_key CHAR(64) NOT NULL PRIMARY KEY,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  INDEX idx_login_attempts_expiry (expires_at)
) ENGINE=InnoDB;

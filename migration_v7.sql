-- v7: track whether login came from installed PWA or browser
ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS is_pwa BOOLEAN NOT NULL DEFAULT FALSE;

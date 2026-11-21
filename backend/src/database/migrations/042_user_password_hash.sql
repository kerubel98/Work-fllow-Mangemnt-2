-- 042_user_password_hash.sql
-- Adds persistent cryptographic password hash column to users table and backfills default admin hash

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Backfill seeded admin account with PBKDF2 hash of standard initial password if currently null
-- Salt: b4288e083b8136bd951decb5e4d5d652
-- Hash of 'admin123': pbkdf2Sync('admin123', salt, 10000, 64, 'sha512')
UPDATE users 
SET password_hash = 'b4288e083b8136bd951decb5e4d5d652:bb31eb58411de78c2142f94e1df979619b6d9e2077520207204b3bc8e14b16fa7a63f03aeeec559a061f9b77661bbe85d5751a269487c8271eb840cfa549778c'
WHERE username = 'admin' AND (password_hash IS NULL OR password_hash = '');

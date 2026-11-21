-- Migration 043: Canonical Issue Status Standardization & Constraint
-- Standardizes issues.status to canonical uppercase strings

UPDATE issues 
SET status = 'IN_PROGRESS' 
WHERE status IN ('In Progress', 'in_progress', 'IN_PROGRESS');

UPDATE issues 
SET status = 'INVESTIGATING' 
WHERE status IN ('Investigating', 'investigating', 'INVESTIGATING');

UPDATE issues 
SET status = 'OPEN' 
WHERE status IN ('Open', 'open', 'OPEN');

UPDATE issues 
SET status = 'RESOLVED' 
WHERE status IN ('Resolved', 'resolved', 'RESOLVED');

UPDATE issues 
SET status = 'CLOSED' 
WHERE status IN ('Closed', 'closed', 'CLOSED');

UPDATE issues 
SET status = 'FAILED' 
WHERE status IN ('Failed', 'failed', 'FAILED');

UPDATE issues 
SET status = 'ESCALATED' 
WHERE status IN ('Escalated', 'escalated', 'ESCALATED');

-- Any remaining unrecognized status defaults to 'OPEN'
UPDATE issues 
SET status = 'OPEN' 
WHERE status NOT IN ('OPEN', 'IN_PROGRESS', 'INVESTIGATING', 'RESOLVED', 'CLOSED', 'FAILED', 'ESCALATED');

ALTER TABLE issues DROP CONSTRAINT IF EXISTS chk_issue_canonical_status;
ALTER TABLE issues ADD CONSTRAINT chk_issue_canonical_status 
CHECK (status IN ('OPEN', 'IN_PROGRESS', 'INVESTIGATING', 'RESOLVED', 'CLOSED', 'FAILED', 'ESCALATED'));


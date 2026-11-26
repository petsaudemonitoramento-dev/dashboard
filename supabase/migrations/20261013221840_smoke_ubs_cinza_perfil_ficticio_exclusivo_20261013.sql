-- Historical version already applied to the hosted database during a temporary smoke test.
-- The temporary credential exception is intentionally NOT replayed on fresh databases.
-- Its replacement, 20261014015455_restore_strict_professional_credential_policy_after_smoke.sql,
-- reinstates the canonical strict rule. No data or account identifiers are reproduced.
SELECT 1;

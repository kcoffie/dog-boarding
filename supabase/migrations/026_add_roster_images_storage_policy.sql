-- Migration 026: Storage RLS policy for roster-images bucket (F-2)
--
-- The roster-images bucket is private. Without this policy, authenticated
-- users cannot call createSignedUrl — the client gets a 403 and the
-- /messages page shows "no image stored" instead of the inline PNG.
--
-- This grants SELECT on storage.objects so authenticated sessions can
-- generate signed URLs. The signed URL itself is time-limited (1 hour TTL
-- set in useMessageLog.js) and usable by anyone who has the URL.
--
-- @requirements REQ-v5.0-F2

CREATE POLICY "authenticated read roster-images"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'roster-images');

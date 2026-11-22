-- Shared conversations should be reachable only by an unguessable share ID
-- through server functions, not enumerable through direct table SELECT access.
drop policy if exists "Anyone can read shared chats" on public.shared_chats;
revoke select on public.shared_chats from anon, authenticated;

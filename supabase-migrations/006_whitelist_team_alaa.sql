-- ==============================================================================
-- 006_whitelist_team_alaa.sql
-- Whitelist the 11 DoorDash Reps under Manager Alaa Abdelaati
-- ==============================================================================

INSERT INTO public.reps_whitelist (email, full_name, role, is_active, manager_id, manager_name, daily_email_limit)
VALUES 
  ('alaa.ali@ext.doordash.com', 'Alaa Ali', 'rep', true, '380563fb-ffe0-4e16-9545-90120a7fdcd4', 'Alaa Abdelaati', 300),
  ('omar.abdelaziz@ext.doordash.com', 'Omar Abdelaziz', 'rep', true, '380563fb-ffe0-4e16-9545-90120a7fdcd4', 'Alaa Abdelaati', 300),
  ('samar.ragab@ext.doordash.com', 'Samar Ragab', 'rep', true, '380563fb-ffe0-4e16-9545-90120a7fdcd4', 'Alaa Abdelaati', 300),
  ('farah.abdelsalam@ext.doordash.com', 'Farah Abdelsalam', 'rep', true, '380563fb-ffe0-4e16-9545-90120a7fdcd4', 'Alaa Abdelaati', 300),
  ('mariam.aamer@ext.doordash.com', 'Mariam Aamer', 'rep', true, '380563fb-ffe0-4e16-9545-90120a7fdcd4', 'Alaa Abdelaati', 300),
  ('raneem.mohamed@ext.doordash.com', 'Raneem Mohamed', 'rep', true, '380563fb-ffe0-4e16-9545-90120a7fdcd4', 'Alaa Abdelaati', 300),
  ('abdallah.sobih@ext.doordash.com', 'Abdallah Sobih', 'rep', true, '380563fb-ffe0-4e16-9545-90120a7fdcd4', 'Alaa Abdelaati', 300),
  ('karim.eltouny@ext.doordash.com', 'Karim Eltouny', 'rep', true, '380563fb-ffe0-4e16-9545-90120a7fdcd4', 'Alaa Abdelaati', 300),
  ('marwan.attia@ext.doordash.com', 'Marwan Attia', 'rep', true, '380563fb-ffe0-4e16-9545-90120a7fdcd4', 'Alaa Abdelaati', 300),
  ('nabil.abdallah@ext.doordash.com', 'Nabil Abdallah', 'rep', true, '380563fb-ffe0-4e16-9545-90120a7fdcd4', 'Alaa Abdelaati', 300),
  ('abdallah.ghareeb@ext.doordash.com', 'Abdallah Ghareeb', 'rep', true, '380563fb-ffe0-4e16-9545-90120a7fdcd4', 'Alaa Abdelaati', 300)
ON CONFLICT (email) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  manager_id = EXCLUDED.manager_id,
  manager_name = EXCLUDED.manager_name,
  is_active = true,
  daily_email_limit = 300;


-- everybody.bike — Development Seed Data
-- Run via: npx supabase db reset
--
-- Creates a realistic dataset covering all relations:
--   auth.users → profiles (via trigger), riders, rider_parents,
--   groups, roll_model_groups, events, event_groups, rsvps
--
-- All seed users can be logged into via magic link on Inbucket
-- (http://localhost:54324). Send a magic link from /login, then
-- open Inbucket to click the link.

-- ============================================================
-- GROUPS
-- ============================================================

insert into public.groups (id, name, color, description, sort_order) values
  ('a1b2c3d4-0001-4000-8000-000000000001', 'Shredders',     '#16A34A', 'Advanced riders who love technical trails', 1),
  ('a1b2c3d4-0002-4000-8000-000000000002', 'Trail Blazers',  '#EA580C', 'Intermediate riders building confidence',   2),
  ('a1b2c3d4-0003-4000-8000-000000000003', 'Dirt Devils',    '#2D5016', 'Beginner riders learning the basics',       3);

-- ============================================================
-- AUTH USERS  (trigger auto-creates profiles with roles)
-- ============================================================
-- Role combos covered:
--   1. super_admin + admin       (Alex Thompson)
--   2. admin                     (Jordan Rivera)
--   3. roll_model                (Casey Morgan)    — coaches Shredders & Trail Blazers
--   4. roll_model                (Riley Chen)      — coaches Dirt Devils
--   5. parent                    (Taylor Williams) — 3 kids
--   6. parent + roll_model       (Morgan Garcia)   — 1 kid + coaches Dirt Devils
--   7. parent + rider            (Sam Patel)       — 1 kid + rides in Trail Blazers
--   8. rider                     (Drew Kim)        — rides in Shredders

insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  -- 1. Alex Thompson — super_admin + admin
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'alex@example.com',
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Alex Thompson","roles":["super_admin","admin"]}',
    false, now(), now(), '', '', '', ''
  ),
  -- 2. Jordan Rivera — admin
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'jordan@example.com',
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Jordan Rivera","roles":["admin"]}',
    false, now(), now(), '', '', '', ''
  ),
  -- 3. Casey Morgan — roll_model
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'casey@example.com',
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Casey Morgan","roles":["roll_model"]}',
    false, now(), now(), '', '', '', ''
  ),
  -- 4. Riley Chen — roll_model
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000004',
    'authenticated', 'authenticated', 'riley@example.com',
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Riley Chen","roles":["roll_model"]}',
    false, now(), now(), '', '', '', ''
  ),
  -- 5. Taylor Williams — parent (3 kids)
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000005',
    'authenticated', 'authenticated', 'taylor@example.com',
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Taylor Williams","roles":["parent"]}',
    false, now(), now(), '', '', '', ''
  ),
  -- 6. Morgan Garcia — parent + roll_model
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000006',
    'authenticated', 'authenticated', 'morgan@example.com',
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Morgan Garcia","roles":["parent","roll_model"]}',
    false, now(), now(), '', '', '', ''
  ),
  -- 7. Sam Patel — parent + rider (rides in Trail Blazers)
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000007',
    'authenticated', 'authenticated', 'sam@example.com',
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Sam Patel","roles":["parent","rider"]}',
    false, now(), now(), '', '', '', ''
  ),
  -- 8. Drew Kim — rider (rides in Shredders)
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000008',
    'authenticated', 'authenticated', 'drew@example.com',
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Drew Kim","roles":["rider"]}',
    false, now(), now(), '', '', '', ''
  );

-- Auth identities (required for Supabase Auth to recognise the users)
insert into auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   jsonb_build_object('sub', '00000000-0000-0000-0000-000000000001', 'email', 'alex@example.com'),
   'email', '00000000-0000-0000-0000-000000000001', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002',
   jsonb_build_object('sub', '00000000-0000-0000-0000-000000000002', 'email', 'jordan@example.com'),
   'email', '00000000-0000-0000-0000-000000000002', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003',
   jsonb_build_object('sub', '00000000-0000-0000-0000-000000000003', 'email', 'casey@example.com'),
   'email', '00000000-0000-0000-0000-000000000003', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004',
   jsonb_build_object('sub', '00000000-0000-0000-0000-000000000004', 'email', 'riley@example.com'),
   'email', '00000000-0000-0000-0000-000000000004', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000005',
   jsonb_build_object('sub', '00000000-0000-0000-0000-000000000005', 'email', 'taylor@example.com'),
   'email', '00000000-0000-0000-0000-000000000005', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006',
   jsonb_build_object('sub', '00000000-0000-0000-0000-000000000006', 'email', 'morgan@example.com'),
   'email', '00000000-0000-0000-0000-000000000006', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000007',
   jsonb_build_object('sub', '00000000-0000-0000-0000-000000000007', 'email', 'sam@example.com'),
   'email', '00000000-0000-0000-0000-000000000007', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000008',
   jsonb_build_object('sub', '00000000-0000-0000-0000-000000000008', 'email', 'drew@example.com'),
   'email', '00000000-0000-0000-0000-000000000008', now(), now(), now());

-- ============================================================
-- ADULT RIDER GROUP ASSIGNMENTS
-- ============================================================
-- Sam Patel rides in Trail Blazers, Drew Kim rides in Shredders

update public.profiles set rider_group_id = 'a1b2c3d4-0002-4000-8000-000000000002'
  where id = '00000000-0000-0000-0000-000000000007';
update public.profiles set rider_group_id = 'a1b2c3d4-0001-4000-8000-000000000001'
  where id = '00000000-0000-0000-0000-000000000008';

-- ============================================================
-- ROLL MODEL → GROUP ASSIGNMENTS
-- ============================================================

insert into public.roll_model_groups (roll_model_id, group_id) values
  -- Casey Morgan coaches Shredders + Trail Blazers
  ('00000000-0000-0000-0000-000000000003', 'a1b2c3d4-0001-4000-8000-000000000001'),
  ('00000000-0000-0000-0000-000000000003', 'a1b2c3d4-0002-4000-8000-000000000002'),
  -- Riley Chen coaches Dirt Devils
  ('00000000-0000-0000-0000-000000000004', 'a1b2c3d4-0003-4000-8000-000000000003'),
  -- Morgan Garcia (parent+roll_model) coaches Dirt Devils
  ('00000000-0000-0000-0000-000000000006', 'a1b2c3d4-0003-4000-8000-000000000003');

-- ============================================================
-- MINOR RIDERS
-- ============================================================

insert into public.riders (id, first_name, last_name, group_id, date_of_birth, emergency_contact) values
  -- Taylor Williams' kids
  ('b1b2c3d4-0001-4000-8000-000000000001', 'Emma',   'Williams', 'a1b2c3d4-0001-4000-8000-000000000001', '2015-03-12', 'Taylor Williams: 555-0105'),
  ('b1b2c3d4-0002-4000-8000-000000000002', 'Liam',   'Williams', 'a1b2c3d4-0002-4000-8000-000000000002', '2017-07-28', 'Taylor Williams: 555-0105'),
  -- Morgan Garcia's kid
  ('b1b2c3d4-0003-4000-8000-000000000003', 'Sophia', 'Garcia',   'a1b2c3d4-0003-4000-8000-000000000003', '2016-11-04', 'Morgan Garcia: 555-0106'),
  -- Sam Patel's kid
  ('b1b2c3d4-0004-4000-8000-000000000004', 'Noah',   'Patel',    'a1b2c3d4-0001-4000-8000-000000000001', '2014-09-22', 'Sam Patel: 555-0107'),
  -- Shared-custody kid: linked to Taylor Williams AND Morgan Garcia
  ('b1b2c3d4-0005-4000-8000-000000000005', 'Ava',    'Martinez', 'a1b2c3d4-0002-4000-8000-000000000002', '2016-05-15', 'Taylor Williams: 555-0105');

-- Additional riders for larger rosters (up to ~20 per group)
insert into public.riders (
  id, first_name, last_name, group_id, date_of_birth, emergency_contact, medical_notes, media_opt_out
) values
  -- Shredders
  ('b1b2c3d4-0101-4000-8000-000000000101', 'Aiden',  'Blake',    'a1b2c3d4-0001-4000-8000-000000000001', '2014-04-10', 'Taylor Williams: 555-0105', 'Asthma', false),
  ('b1b2c3d4-0102-4000-8000-000000000102', 'Harper', 'Cole',     'a1b2c3d4-0001-4000-8000-000000000001', '2015-02-19', 'Morgan Garcia: 555-0106', null, false),
  ('b1b2c3d4-0103-4000-8000-000000000103', 'Mason',  'Dale',     'a1b2c3d4-0001-4000-8000-000000000001', '2014-11-03', 'Sam Patel: 555-0107', null, false),
  ('b1b2c3d4-0104-4000-8000-000000000104', 'Zoe',    'Ellis',    'a1b2c3d4-0001-4000-8000-000000000001', '2016-01-25', 'Taylor Williams: 555-0105', 'Peanut allergy', false),
  ('b1b2c3d4-0105-4000-8000-000000000105', 'Lucas',  'Ford',     'a1b2c3d4-0001-4000-8000-000000000001', '2015-06-14', 'Morgan Garcia: 555-0106', null, false),
  ('b1b2c3d4-0106-4000-8000-000000000106', 'Nora',   'Gray',     'a1b2c3d4-0001-4000-8000-000000000001', '2016-09-02', 'Sam Patel: 555-0107', null, false),
  ('b1b2c3d4-0107-4000-8000-000000000107', 'Owen',   'Hall',     'a1b2c3d4-0001-4000-8000-000000000001', '2015-12-08', 'Taylor Williams: 555-0105', null, false),
  ('b1b2c3d4-0108-4000-8000-000000000108', 'Mia',    'Ivers',    'a1b2c3d4-0001-4000-8000-000000000001', '2016-03-17', 'Morgan Garcia: 555-0106', null, false),
  ('b1b2c3d4-0109-4000-8000-000000000109', 'Caleb',  'Jones',    'a1b2c3d4-0001-4000-8000-000000000001', '2014-05-29', 'Sam Patel: 555-0107', null, false),
  ('b1b2c3d4-0110-4000-8000-000000000110', 'Layla',  'Kerr',     'a1b2c3d4-0001-4000-8000-000000000001', '2015-07-11', 'Taylor Williams: 555-0105', null, false),
  ('b1b2c3d4-0111-4000-8000-000000000111', 'Jack',   'Lane',     'a1b2c3d4-0001-4000-8000-000000000001', '2014-08-21', 'Morgan Garcia: 555-0106', null, false),
  ('b1b2c3d4-0112-4000-8000-000000000112', 'Ivy',    'Moore',    'a1b2c3d4-0001-4000-8000-000000000001', '2016-10-30', 'Sam Patel: 555-0107', null, false),
  ('b1b2c3d4-0113-4000-8000-000000000113', 'Ethan',  'Nash',     'a1b2c3d4-0001-4000-8000-000000000001', '2015-01-09', 'Taylor Williams: 555-0105', null, false),
  ('b1b2c3d4-0114-4000-8000-000000000114', 'Aria',   'Olsen',    'a1b2c3d4-0001-4000-8000-000000000001', '2016-04-22', 'Morgan Garcia: 555-0106', null, false),
  ('b1b2c3d4-0115-4000-8000-000000000115', 'Ryan',   'Park',     'a1b2c3d4-0001-4000-8000-000000000001', '2014-12-01', 'Sam Patel: 555-0107', null, true),
  ('b1b2c3d4-0116-4000-8000-000000000116', 'Chloe',  'Quinn',    'a1b2c3d4-0001-4000-8000-000000000001', '2015-03-05', 'Taylor Williams: 555-0105', null, false),
  ('b1b2c3d4-0117-4000-8000-000000000117', 'Eli',    'Reed',     'a1b2c3d4-0001-4000-8000-000000000001', '2016-06-18', 'Morgan Garcia: 555-0106', null, false),

  -- Trail Blazers
  ('b1b2c3d4-0201-4000-8000-000000000201', 'Lily',   'Stone',    'a1b2c3d4-0002-4000-8000-000000000002', '2014-02-12', 'Taylor Williams: 555-0105', 'Type 1 diabetes', false),
  ('b1b2c3d4-0202-4000-8000-000000000202', 'Ben',    'Turner',   'a1b2c3d4-0002-4000-8000-000000000002', '2015-05-27', 'Morgan Garcia: 555-0106', null, false),
  ('b1b2c3d4-0203-4000-8000-000000000203', 'Grace',  'Underwood','a1b2c3d4-0002-4000-8000-000000000002', '2016-07-08', 'Sam Patel: 555-0107', null, false),
  ('b1b2c3d4-0204-4000-8000-000000000204', 'Wyatt',  'Vale',     'a1b2c3d4-0002-4000-8000-000000000002', '2015-09-19', 'Taylor Williams: 555-0105', null, false),
  ('b1b2c3d4-0205-4000-8000-000000000205', 'Ella',   'West',     'a1b2c3d4-0002-4000-8000-000000000002', '2014-11-30', 'Morgan Garcia: 555-0106', null, false),
  ('b1b2c3d4-0206-4000-8000-000000000206', 'Jonah',  'Xu',       'a1b2c3d4-0002-4000-8000-000000000002', '2016-01-14', 'Sam Patel: 555-0107', null, false),
  ('b1b2c3d4-0207-4000-8000-000000000207', 'Paige',  'Young',    'a1b2c3d4-0002-4000-8000-000000000002', '2015-04-03', 'Taylor Williams: 555-0105', null, false),
  ('b1b2c3d4-0208-4000-8000-000000000208', 'Finn',   'Zane',     'a1b2c3d4-0002-4000-8000-000000000002', '2016-08-26', 'Morgan Garcia: 555-0106', null, false),
  ('b1b2c3d4-0209-4000-8000-000000000209', 'Ruby',   'Adams',    'a1b2c3d4-0002-4000-8000-000000000002', '2014-06-11', 'Sam Patel: 555-0107', null, false),
  ('b1b2c3d4-0210-4000-8000-000000000210', 'Carter', 'Brown',    'a1b2c3d4-0002-4000-8000-000000000002', '2015-02-07', 'Taylor Williams: 555-0105', null, false),
  ('b1b2c3d4-0211-4000-8000-000000000211', 'Stella', 'Cruz',     'a1b2c3d4-0002-4000-8000-000000000002', '2016-03-29', 'Morgan Garcia: 555-0106', null, false),
  ('b1b2c3d4-0212-4000-8000-000000000212', 'Leo',    'Diaz',     'a1b2c3d4-0002-4000-8000-000000000002', '2014-12-22', 'Sam Patel: 555-0107', null, false),
  ('b1b2c3d4-0213-4000-8000-000000000213', 'Hazel',  'Evans',    'a1b2c3d4-0002-4000-8000-000000000002', '2015-10-05', 'Taylor Williams: 555-0105', null, false),
  ('b1b2c3d4-0214-4000-8000-000000000214', 'Miles',  'Finch',    'a1b2c3d4-0002-4000-8000-000000000002', '2016-02-16', 'Morgan Garcia: 555-0106', null, true),
  ('b1b2c3d4-0215-4000-8000-000000000215', 'Isla',   'Grant',    'a1b2c3d4-0002-4000-8000-000000000002', '2014-09-09', 'Sam Patel: 555-0107', null, false),
  ('b1b2c3d4-0216-4000-8000-000000000216', 'Theo',   'Hart',     'a1b2c3d4-0002-4000-8000-000000000002', '2015-06-01', 'Taylor Williams: 555-0105', null, false),
  ('b1b2c3d4-0217-4000-8000-000000000217', 'Violet', 'Irwin',    'a1b2c3d4-0002-4000-8000-000000000002', '2016-11-12', 'Morgan Garcia: 555-0106', null, false),

  -- Dirt Devils
  ('b1b2c3d4-0301-4000-8000-000000000301', 'Jude',   'Keller',   'a1b2c3d4-0003-4000-8000-000000000003', '2015-01-27', 'Taylor Williams: 555-0105', null, false),
  ('b1b2c3d4-0302-4000-8000-000000000302', 'Piper',  'Lewis',    'a1b2c3d4-0003-4000-8000-000000000003', '2016-05-20', 'Morgan Garcia: 555-0106', 'Carries epinephrine', false),
  ('b1b2c3d4-0303-4000-8000-000000000303', 'Gavin',  'Miles',    'a1b2c3d4-0003-4000-8000-000000000003', '2014-10-14', 'Sam Patel: 555-0107', null, false),
  ('b1b2c3d4-0304-4000-8000-000000000304', 'Sadie',  'Nolan',    'a1b2c3d4-0003-4000-8000-000000000003', '2015-04-09', 'Taylor Williams: 555-0105', null, false),
  ('b1b2c3d4-0305-4000-8000-000000000305', 'Colin',  'Ortiz',    'a1b2c3d4-0003-4000-8000-000000000003', '2016-07-01', 'Morgan Garcia: 555-0106', null, false),
  ('b1b2c3d4-0306-4000-8000-000000000306', 'Willa',  'Perez',    'a1b2c3d4-0003-4000-8000-000000000003', '2014-03-26', 'Sam Patel: 555-0107', null, false),
  ('b1b2c3d4-0307-4000-8000-000000000307', 'Rowan',  'Quinn',    'a1b2c3d4-0003-4000-8000-000000000003', '2015-12-18', 'Taylor Williams: 555-0105', null, false),
  ('b1b2c3d4-0308-4000-8000-000000000308', 'Lucy',   'Ross',     'a1b2c3d4-0003-4000-8000-000000000003', '2016-02-02', 'Morgan Garcia: 555-0106', null, false),
  ('b1b2c3d4-0309-4000-8000-000000000309', 'Henry',  'Shaw',     'a1b2c3d4-0003-4000-8000-000000000003', '2014-09-28', 'Sam Patel: 555-0107', null, false),
  ('b1b2c3d4-0310-4000-8000-000000000310', 'Tessa',  'Vaughn',   'a1b2c3d4-0003-4000-8000-000000000003', '2015-08-07', 'Taylor Williams: 555-0105', null, true),
  ('b1b2c3d4-0311-4000-8000-000000000311', 'Eli',    'Walker',   'a1b2c3d4-0003-4000-8000-000000000003', '2016-06-23', 'Morgan Garcia: 555-0106', null, false),
  ('b1b2c3d4-0312-4000-8000-000000000312', 'Maya',   'Xu',       'a1b2c3d4-0003-4000-8000-000000000003', '2014-01-16', 'Sam Patel: 555-0107', null, false),
  ('b1b2c3d4-0313-4000-8000-000000000313', 'Asher',  'Young',    'a1b2c3d4-0003-4000-8000-000000000003', '2015-11-04', 'Taylor Williams: 555-0105', null, false),
  ('b1b2c3d4-0314-4000-8000-000000000314', 'Clara',  'Zane',     'a1b2c3d4-0003-4000-8000-000000000003', '2016-04-15', 'Morgan Garcia: 555-0106', null, false),
  ('b1b2c3d4-0315-4000-8000-000000000315', 'Bennett','Avery',    'a1b2c3d4-0003-4000-8000-000000000003', '2014-12-12', 'Sam Patel: 555-0107', null, false),
  ('b1b2c3d4-0316-4000-8000-000000000316', 'June',   'Baker',    'a1b2c3d4-0003-4000-8000-000000000003', '2015-02-24', 'Taylor Williams: 555-0105', null, false),
  ('b1b2c3d4-0317-4000-8000-000000000317', 'Callum','Drake',     'a1b2c3d4-0003-4000-8000-000000000003', '2016-09-10', 'Morgan Garcia: 555-0106', null, false),
  ('b1b2c3d4-0318-4000-8000-000000000318', 'Freya', 'Easton',    'a1b2c3d4-0003-4000-8000-000000000003', '2014-07-22', 'Sam Patel: 555-0107', null, false),
  ('b1b2c3d4-0319-4000-8000-000000000319', 'Grant', 'Foster',    'a1b2c3d4-0003-4000-8000-000000000003', '2015-03-03', 'Taylor Williams: 555-0105', 'Asthma', false);

-- ============================================================
-- RIDER ↔ PARENT LINKS  (many-to-many)
-- ============================================================

insert into public.rider_parents (rider_id, parent_id, relationship, is_primary) values
  -- Taylor Williams is primary parent for Emma, Liam, and Ava
  ('b1b2c3d4-0001-4000-8000-000000000001', '00000000-0000-0000-0000-000000000005', 'parent', true),
  ('b1b2c3d4-0002-4000-8000-000000000002', '00000000-0000-0000-0000-000000000005', 'parent', true),
  ('b1b2c3d4-0005-4000-8000-000000000005', '00000000-0000-0000-0000-000000000005', 'parent', true),
  -- Morgan Garcia is primary parent for Sophia, and secondary for Ava (shared custody)
  ('b1b2c3d4-0003-4000-8000-000000000003', '00000000-0000-0000-0000-000000000006', 'parent', true),
  ('b1b2c3d4-0005-4000-8000-000000000005', '00000000-0000-0000-0000-000000000006', 'guardian', false),
  -- Sam Patel is primary parent for Noah
  ('b1b2c3d4-0004-4000-8000-000000000004', '00000000-0000-0000-0000-000000000007', 'parent', true),
  -- Additional riders (cycle parents)
  ('b1b2c3d4-0101-4000-8000-000000000101', '00000000-0000-0000-0000-000000000005', 'parent', true),
  ('b1b2c3d4-0102-4000-8000-000000000102', '00000000-0000-0000-0000-000000000006', 'parent', true),
  ('b1b2c3d4-0103-4000-8000-000000000103', '00000000-0000-0000-0000-000000000007', 'parent', true),
  ('b1b2c3d4-0104-4000-8000-000000000104', '00000000-0000-0000-0000-000000000005', 'parent', true),
  ('b1b2c3d4-0105-4000-8000-000000000105', '00000000-0000-0000-0000-000000000006', 'parent', true),
  ('b1b2c3d4-0106-4000-8000-000000000106', '00000000-0000-0000-0000-000000000007', 'parent', true),
  ('b1b2c3d4-0107-4000-8000-000000000107', '00000000-0000-0000-0000-000000000005', 'parent', true),
  ('b1b2c3d4-0108-4000-8000-000000000108', '00000000-0000-0000-0000-000000000006', 'parent', true),
  ('b1b2c3d4-0109-4000-8000-000000000109', '00000000-0000-0000-0000-000000000007', 'parent', true),
  ('b1b2c3d4-0110-4000-8000-000000000110', '00000000-0000-0000-0000-000000000005', 'parent', true),
  ('b1b2c3d4-0111-4000-8000-000000000111', '00000000-0000-0000-0000-000000000006', 'parent', true),
  ('b1b2c3d4-0112-4000-8000-000000000112', '00000000-0000-0000-0000-000000000007', 'parent', true),
  ('b1b2c3d4-0113-4000-8000-000000000113', '00000000-0000-0000-0000-000000000005', 'parent', true),
  ('b1b2c3d4-0114-4000-8000-000000000114', '00000000-0000-0000-0000-000000000006', 'parent', true),
  ('b1b2c3d4-0115-4000-8000-000000000115', '00000000-0000-0000-0000-000000000007', 'parent', true),
  ('b1b2c3d4-0116-4000-8000-000000000116', '00000000-0000-0000-0000-000000000005', 'parent', true),
  ('b1b2c3d4-0117-4000-8000-000000000117', '00000000-0000-0000-0000-000000000006', 'parent', true),

  ('b1b2c3d4-0201-4000-8000-000000000201', '00000000-0000-0000-0000-000000000005', 'parent', true),
  ('b1b2c3d4-0202-4000-8000-000000000202', '00000000-0000-0000-0000-000000000006', 'parent', true),
  ('b1b2c3d4-0203-4000-8000-000000000203', '00000000-0000-0000-0000-000000000007', 'parent', true),
  ('b1b2c3d4-0204-4000-8000-000000000204', '00000000-0000-0000-0000-000000000005', 'parent', true),
  ('b1b2c3d4-0205-4000-8000-000000000205', '00000000-0000-0000-0000-000000000006', 'parent', true),
  ('b1b2c3d4-0206-4000-8000-000000000206', '00000000-0000-0000-0000-000000000007', 'parent', true),
  ('b1b2c3d4-0207-4000-8000-000000000207', '00000000-0000-0000-0000-000000000005', 'parent', true),
  ('b1b2c3d4-0208-4000-8000-000000000208', '00000000-0000-0000-0000-000000000006', 'parent', true),
  ('b1b2c3d4-0209-4000-8000-000000000209', '00000000-0000-0000-0000-000000000007', 'parent', true),
  ('b1b2c3d4-0210-4000-8000-000000000210', '00000000-0000-0000-0000-000000000005', 'parent', true),
  ('b1b2c3d4-0211-4000-8000-000000000211', '00000000-0000-0000-0000-000000000006', 'parent', true),
  ('b1b2c3d4-0212-4000-8000-000000000212', '00000000-0000-0000-0000-000000000007', 'parent', true),
  ('b1b2c3d4-0213-4000-8000-000000000213', '00000000-0000-0000-0000-000000000005', 'parent', true),
  ('b1b2c3d4-0214-4000-8000-000000000214', '00000000-0000-0000-0000-000000000006', 'parent', true),
  ('b1b2c3d4-0215-4000-8000-000000000215', '00000000-0000-0000-0000-000000000007', 'parent', true),
  ('b1b2c3d4-0216-4000-8000-000000000216', '00000000-0000-0000-0000-000000000005', 'parent', true),
  ('b1b2c3d4-0217-4000-8000-000000000217', '00000000-0000-0000-0000-000000000006', 'parent', true),

  ('b1b2c3d4-0301-4000-8000-000000000301', '00000000-0000-0000-0000-000000000005', 'parent', true),
  ('b1b2c3d4-0302-4000-8000-000000000302', '00000000-0000-0000-0000-000000000006', 'parent', true),
  ('b1b2c3d4-0303-4000-8000-000000000303', '00000000-0000-0000-0000-000000000007', 'parent', true),
  ('b1b2c3d4-0304-4000-8000-000000000304', '00000000-0000-0000-0000-000000000005', 'parent', true),
  ('b1b2c3d4-0305-4000-8000-000000000305', '00000000-0000-0000-0000-000000000006', 'parent', true),
  ('b1b2c3d4-0306-4000-8000-000000000306', '00000000-0000-0000-0000-000000000007', 'parent', true),
  ('b1b2c3d4-0307-4000-8000-000000000307', '00000000-0000-0000-0000-000000000005', 'parent', true),
  ('b1b2c3d4-0308-4000-8000-000000000308', '00000000-0000-0000-0000-000000000006', 'parent', true),
  ('b1b2c3d4-0309-4000-8000-000000000309', '00000000-0000-0000-0000-000000000007', 'parent', true),
  ('b1b2c3d4-0310-4000-8000-000000000310', '00000000-0000-0000-0000-000000000005', 'parent', true),
  ('b1b2c3d4-0311-4000-8000-000000000311', '00000000-0000-0000-0000-000000000006', 'parent', true),
  ('b1b2c3d4-0312-4000-8000-000000000312', '00000000-0000-0000-0000-000000000007', 'parent', true),
  ('b1b2c3d4-0313-4000-8000-000000000313', '00000000-0000-0000-0000-000000000005', 'parent', true),
  ('b1b2c3d4-0314-4000-8000-000000000314', '00000000-0000-0000-0000-000000000006', 'parent', true),
  ('b1b2c3d4-0315-4000-8000-000000000315', '00000000-0000-0000-0000-000000000007', 'parent', true),
  ('b1b2c3d4-0316-4000-8000-000000000316', '00000000-0000-0000-0000-000000000005', 'parent', true),
  ('b1b2c3d4-0317-4000-8000-000000000317', '00000000-0000-0000-0000-000000000006', 'parent', true),
  ('b1b2c3d4-0318-4000-8000-000000000318', '00000000-0000-0000-0000-000000000007', 'parent', true),
  ('b1b2c3d4-0319-4000-8000-000000000319', '00000000-0000-0000-0000-000000000005', 'parent', true);

-- ============================================================
-- EVENTS
-- ============================================================
-- Mix of: past / upcoming, one-off / recurring series, different types

insert into public.events (id, title, type, description, location, map_url, starts_at, ends_at, rsvp_deadline, capacity, weather_notes, recurrence_rule, series_id, created_by) values
  -- Recurring Saturday Group Ride series (3 occurrences)
  ('c1b2c3d4-0001-4000-8000-000000000001',
   'Saturday Group Ride', 'ride',
   'Weekly group ride on the local trails. All skill levels welcome within your group.',
   'Riverside Trailhead', 'https://maps.example.com/riverside',
   '2026-02-01T09:00:00Z', '2026-02-01T11:00:00Z',
   '2026-01-31T18:00:00Z', null, 'Dress warm — expected high 45°F',
   'FREQ=WEEKLY;BYDAY=SA', 'd1b2c3d4-0001-4000-8000-000000000001',
   '00000000-0000-0000-0000-000000000001'),

  ('c1b2c3d4-0002-4000-8000-000000000002',
   'Saturday Group Ride', 'ride',
   'Weekly group ride on the local trails. All skill levels welcome within your group.',
   'Riverside Trailhead', 'https://maps.example.com/riverside',
   '2026-02-08T09:00:00Z', '2026-02-08T11:00:00Z',
   '2026-02-07T18:00:00Z', null, null,
   'FREQ=WEEKLY;BYDAY=SA', 'd1b2c3d4-0001-4000-8000-000000000001',
   '00000000-0000-0000-0000-000000000001'),

  ('c1b2c3d4-0003-4000-8000-000000000003',
   'Saturday Group Ride', 'ride',
   'Weekly group ride on the local trails. All skill levels welcome within your group.',
   'Riverside Trailhead', 'https://maps.example.com/riverside',
   '2026-02-15T09:00:00Z', '2026-02-15T11:00:00Z',
   '2026-02-14T18:00:00Z', null, null,
   'FREQ=WEEKLY;BYDAY=SA', 'd1b2c3d4-0001-4000-8000-000000000001',
   '00000000-0000-0000-0000-000000000001'),

  -- Skills Clinic (one-off, all groups)
  ('c1b2c3d4-0004-4000-8000-000000000004',
   'Skills Clinic: Cornering', 'clinic',
   'Learn proper cornering technique with Casey and the coaching team. Flat pedals recommended.',
   'Cedar Skills Park', null,
   '2026-02-12T14:00:00Z', '2026-02-12T16:00:00Z',
   '2026-02-11T12:00:00Z', 30, null,
   null, null,
   '00000000-0000-0000-0000-000000000002'),

  -- End of Season BBQ (social, all groups)
  ('c1b2c3d4-0005-4000-8000-000000000005',
   'End of Season BBQ', 'social',
   'Celebrate a great season! Food and drinks provided. Bring your family.',
   'Hilltop Pavilion', null,
   '2026-02-22T12:00:00Z', '2026-02-22T15:00:00Z',
   null, null, null,
   null, null,
   '00000000-0000-0000-0000-000000000001'),

  -- Coach Meeting (meeting, no riders)
  ('c1b2c3d4-0006-4000-8000-000000000006',
   'Coach Planning Meeting', 'meeting',
   'Season planning: discuss group assignments, scheduling, and goals for next season.',
   'Zoom (link in description)', null,
   '2026-02-10T19:00:00Z', '2026-02-10T20:00:00Z',
   null, null, null,
   null, null,
   '00000000-0000-0000-0000-000000000002'),

  -- Dirt Devils-only Trail Day (ride, single group)
  ('c1b2c3d4-0007-4000-8000-000000000007',
   'Dirt Devils Trail Day', 'ride',
   'Introductory trail ride for our newest riders. Easy pace, lots of encouragement!',
   'Meadow Loop Trailhead', 'https://maps.example.com/meadow',
   '2026-02-14T10:00:00Z', '2026-02-14T11:30:00Z',
   '2026-02-13T18:00:00Z', 15, 'Rain cancels — check group chat morning of.',
   null, null,
   '00000000-0000-0000-0000-000000000006');

-- ============================================================
-- EVENT ↔ GROUP LINKS
-- ============================================================

insert into public.event_groups (event_id, group_id) values
  -- Saturday Group Ride #1 → Shredders + Trail Blazers
  ('c1b2c3d4-0001-4000-8000-000000000001', 'a1b2c3d4-0001-4000-8000-000000000001'),
  ('c1b2c3d4-0001-4000-8000-000000000001', 'a1b2c3d4-0002-4000-8000-000000000002'),
  -- Saturday Group Ride #2 → Shredders + Trail Blazers
  ('c1b2c3d4-0002-4000-8000-000000000002', 'a1b2c3d4-0001-4000-8000-000000000001'),
  ('c1b2c3d4-0002-4000-8000-000000000002', 'a1b2c3d4-0002-4000-8000-000000000002'),
  -- Saturday Group Ride #3 → Shredders + Trail Blazers
  ('c1b2c3d4-0003-4000-8000-000000000003', 'a1b2c3d4-0001-4000-8000-000000000001'),
  ('c1b2c3d4-0003-4000-8000-000000000003', 'a1b2c3d4-0002-4000-8000-000000000002'),
  -- Skills Clinic → all 3 groups
  ('c1b2c3d4-0004-4000-8000-000000000004', 'a1b2c3d4-0001-4000-8000-000000000001'),
  ('c1b2c3d4-0004-4000-8000-000000000004', 'a1b2c3d4-0002-4000-8000-000000000002'),
  ('c1b2c3d4-0004-4000-8000-000000000004', 'a1b2c3d4-0003-4000-8000-000000000003'),
  -- End of Season BBQ → all 3 groups
  ('c1b2c3d4-0005-4000-8000-000000000005', 'a1b2c3d4-0001-4000-8000-000000000001'),
  ('c1b2c3d4-0005-4000-8000-000000000005', 'a1b2c3d4-0002-4000-8000-000000000002'),
  ('c1b2c3d4-0005-4000-8000-000000000005', 'a1b2c3d4-0003-4000-8000-000000000003'),
  -- Coach Meeting → no group assignment (admin-only meeting)
  -- Dirt Devils Trail Day → Dirt Devils only
  ('c1b2c3d4-0007-4000-8000-000000000007', 'a1b2c3d4-0003-4000-8000-000000000003');

-- ============================================================
-- RSVPs  (past event + upcoming events)
-- ============================================================

insert into public.rsvps (event_id, user_id, rider_id, status, responded_at) values
  -- === Past Saturday Ride (Feb 1) — fully RSVPd ===
  -- Roll models self-RSVP
  ('c1b2c3d4-0001-4000-8000-000000000001', '00000000-0000-0000-0000-000000000003', null, 'yes',   '2026-01-30T10:00:00Z'),  -- Casey: yes
  -- Parent RSVPs for minors
  ('c1b2c3d4-0001-4000-8000-000000000001', '00000000-0000-0000-0000-000000000005', 'b1b2c3d4-0001-4000-8000-000000000001', 'yes',   '2026-01-30T12:00:00Z'),  -- Taylor RSVPs Emma: yes
  ('c1b2c3d4-0001-4000-8000-000000000001', '00000000-0000-0000-0000-000000000005', 'b1b2c3d4-0002-4000-8000-000000000002', 'maybe', '2026-01-30T12:00:00Z'),  -- Taylor RSVPs Liam: maybe
  ('c1b2c3d4-0001-4000-8000-000000000001', '00000000-0000-0000-0000-000000000005', 'b1b2c3d4-0005-4000-8000-000000000005', 'yes',   '2026-01-30T12:00:00Z'),  -- Taylor RSVPs Ava: yes
  -- Adult rider self-RSVPs
  ('c1b2c3d4-0001-4000-8000-000000000001', '00000000-0000-0000-0000-000000000007', null, 'yes',   '2026-01-31T08:00:00Z'),  -- Sam (rider): yes
  ('c1b2c3d4-0001-4000-8000-000000000001', '00000000-0000-0000-0000-000000000008', null, 'yes',   '2026-01-31T09:00:00Z'),  -- Drew (rider): yes
  -- Sam also RSVPs his kid
  ('c1b2c3d4-0001-4000-8000-000000000001', '00000000-0000-0000-0000-000000000007', 'b1b2c3d4-0004-4000-8000-000000000004', 'yes',   '2026-01-31T08:00:00Z'),  -- Sam RSVPs Noah: yes

  -- === Upcoming Saturday Ride (Feb 15) — partial RSVPs ===
  ('c1b2c3d4-0003-4000-8000-000000000003', '00000000-0000-0000-0000-000000000003', null, 'yes',   '2026-02-07T10:00:00Z'),  -- Casey: yes
  ('c1b2c3d4-0003-4000-8000-000000000003', '00000000-0000-0000-0000-000000000005', 'b1b2c3d4-0001-4000-8000-000000000001', 'yes',   '2026-02-07T14:00:00Z'),  -- Taylor RSVPs Emma: yes
  ('c1b2c3d4-0003-4000-8000-000000000003', '00000000-0000-0000-0000-000000000005', 'b1b2c3d4-0002-4000-8000-000000000002', 'no',    '2026-02-07T14:00:00Z'),  -- Taylor RSVPs Liam: no
  ('c1b2c3d4-0003-4000-8000-000000000003', '00000000-0000-0000-0000-000000000008', null, 'yes',   '2026-02-07T16:00:00Z'),  -- Drew: yes

  -- === Skills Clinic (Feb 12) — a few RSVPs ===
  ('c1b2c3d4-0004-4000-8000-000000000004', '00000000-0000-0000-0000-000000000003', null, 'yes',   '2026-02-06T11:00:00Z'),  -- Casey: yes
  ('c1b2c3d4-0004-4000-8000-000000000004', '00000000-0000-0000-0000-000000000004', null, 'maybe', '2026-02-06T15:00:00Z'),  -- Riley: maybe
  ('c1b2c3d4-0004-4000-8000-000000000004', '00000000-0000-0000-0000-000000000006', null, 'yes',   '2026-02-06T09:00:00Z'),  -- Morgan (roll_model self): yes
  ('c1b2c3d4-0004-4000-8000-000000000004', '00000000-0000-0000-0000-000000000006', 'b1b2c3d4-0003-4000-8000-000000000003', 'yes',   '2026-02-06T09:00:00Z'),  -- Morgan RSVPs Sophia: yes
  ('c1b2c3d4-0004-4000-8000-000000000004', '00000000-0000-0000-0000-000000000007', null, 'no',    '2026-02-06T20:00:00Z'),  -- Sam (rider): no

  -- === Dirt Devils Trail Day (Feb 14) ===
  ('c1b2c3d4-0007-4000-8000-000000000007', '00000000-0000-0000-0000-000000000004', null, 'yes',   '2026-02-08T10:00:00Z'),  -- Riley: yes
  ('c1b2c3d4-0007-4000-8000-000000000007', '00000000-0000-0000-0000-000000000006', null, 'yes',   '2026-02-08T11:00:00Z'),  -- Morgan (roll_model self): yes
  ('c1b2c3d4-0007-4000-8000-000000000007', '00000000-0000-0000-0000-000000000006', 'b1b2c3d4-0003-4000-8000-000000000003', 'yes',   '2026-02-08T11:00:00Z');  -- Morgan RSVPs Sophia: yes

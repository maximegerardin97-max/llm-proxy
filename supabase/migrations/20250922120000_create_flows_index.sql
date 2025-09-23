-- Create flows_index table (minimal schema) and seed with common flows

create table if not exists public.flows_index (
  id bigint generated always as identity primary key,
  app text not null,
  flow text not null,
  platform text,
  industry text,
  tone text,
  short_desc text,
  is_active boolean not null default true,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(app, flow)
);

-- Simple trigger to keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists flows_index_set_updated_at on public.flows_index;
create trigger flows_index_set_updated_at
before update on public.flows_index
for each row execute function public.set_updated_at();

-- Seed: one canonical flow per app to keep COMMAND mapping simple
-- Flow chosen: "Onboarding" (widely present across products)

insert into public.flows_index (app, flow, platform, industry, tone, short_desc, is_active)
values
  ('BeReal', 'Onboarding', 'iOS', 'Social Media', 'Bold', 'Account creation and daily-be-real intro with camera permissions.', true),
  ('TikTok', 'Onboarding', 'iOS', 'Social Media', 'Bold', 'New user signup and initial interest signals to feed the For You page.', true),
  ('Instagram', 'Onboarding', 'iOS', 'Social Media', 'Bold', 'Signup, username, contacts, and first-follow suggestions into feed.', true),
  ('Snapchat', 'Onboarding', 'iOS', 'Social Media', 'Bold', 'Signup, phone verification, camera permissions, and friend add intro.', true),
  ('Lemon8', 'Onboarding', 'iOS', 'Social Media', 'Bold', 'Signup and initial topic/style preferences to personalize the feed.', true),
  ('Uber', 'Onboarding', 'iOS', 'Mobility', 'Serious', 'Account creation, location permissions, payment setup starter.', true),
  ('Duolingo', 'Onboarding', 'iOS', 'Education', 'Serious', 'Goal selection, placement test, and streak/notification primer.', true),
  ('Headspace', 'Onboarding', 'iOS', 'Health & Wellness', 'Serious', 'Intent selection and intro to daily meditation routines.', true),
  ('Strava', 'Onboarding', 'iOS', 'Sports & Fitness', 'Serious', 'Account, device permissions, and activity/club discovery intro.', true),
  ('Nike Training Club', 'Onboarding', 'iOS', 'Sports & Fitness', 'Serious', 'Fitness goals, program suggestions, and notification primer.', true),
  ('Tinder', 'Onboarding', 'iOS', 'Dating', 'Bold', 'Signup, profile basics, location/age prefs leading into first swipes.', true),
  ('Bumble', 'Onboarding', 'iOS', 'Dating', 'Bold', 'Signup, profile, preferences, and women-first messaging cue intro.', true),
  ('Spotify', 'Onboarding', 'iOS', 'Entertainment', 'Bold', 'Account creation and taste seeding to personalize Home/Radio.', true),
  ('SoundCloud', 'Onboarding', 'iOS', 'Entertainment', 'Bold', 'Signup, artist/genre follows to seed stream and library.', true),
  ('Discord (iOS)', 'Onboarding', 'iOS', 'Community & Messaging', 'Bold', 'Account setup, server discovery invites, and permissions intro.', true),
  ('Depop', 'Onboarding', 'iOS', 'Commerce', 'Bold', 'Signup and style/brand preferences to personalize marketplace.', true),
  ('VSCO', 'Onboarding', 'iOS', 'Creative Tools', 'Bold', 'Account creation, presets intro, and camera/library permissions.', true),
  ('Calm', 'Onboarding', 'iOS', 'Health & Wellness', 'Serious', 'Goals selection, sleep/anxiety tracks intro, notification primer.', true),
  ('Revolut', 'Onboarding', 'iOS', 'Finance', 'Serious', 'KYC kickoff, card provisioning intro, and security settings.', true),
  ('Figma', 'Onboarding', 'Web', 'Design Tools', 'Serious', 'Signup, workspace/team creation, and welcome file tour.', true),
  ('Framer', 'Onboarding', 'Web', 'Design Tools', 'Bold', 'Account creation and first project template selection.', true),
  ('Notion', 'Onboarding', 'Web', 'Productivity', 'Serious', 'Workspace creation, template selection, and sharing intro.', true),
  ('Superhuman', 'Onboarding', 'Web', 'Productivity', 'Bold', 'Invite-based signup, keyboard-first setup, and shortcuts primer.', true),
  ('Midjourney', 'Onboarding', 'Discord', 'AI Creativity', 'Bold', 'Server join, plan intro, and first prompt guidance in Discord.', true),
  ('Runway', 'Onboarding', 'Web', 'AI Creativity', 'Bold', 'Signup, workspace creation, and first video project setup.', true),
  ('Perplexity', 'Onboarding', 'Web', 'Knowledge Search', 'Serious', 'Account signup, search modes intro, and citations primer.', true),
  ('Substack', 'Onboarding', 'Web', 'Publishing', 'Serious', 'Creator setup, publication name, and first post/newsletter intro.', true)
on conflict (app, flow) do update set
  platform = excluded.platform,
  industry = excluded.industry,
  tone = excluded.tone,
  short_desc = excluded.short_desc,
  is_active = excluded.is_active,
  updated_at = now();



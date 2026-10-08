-- Thoq, schema v1.
--
-- Places come from the catalogue import (data-tools/load_places.py). Everything else is written by
-- signed-in users through row-level security: anyone signed in can read what the app shows about other
-- people (profiles, rankings, visits, lists, follows); only you can change your own rows; private
-- signals (preferences, comparisons, impressions, interactions, saved, reports) are readable by you alone.
--
-- Scores are never stored. A ranking is an ordered list per band, and `ranking_scores` reads the score
-- off the position with the same formula as src/reco/ranking.ts (bandScore).

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------- catalogue

create table public.categories (
  id text primary key,
  label_en text not null,
  label_ar text not null,
  ranked_with text not null check (ranked_with in ('cafe', 'restaurant', 'neutral'))
);

create table public.places (
  id text primary key,
  source text not null default 'foursquare',
  source_ids text[] not null default '{}',
  name_en text not null default '',
  name_ar text not null default '',
  kind text not null check (kind in ('cafe', 'restaurant')),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  location extensions.geography(point, 4326)
    generated always as (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography) stored,
  -- Lower-cased, with Arabic letter variants folded (أ إ آ ٱ → ا, ى → ي, ة → ه), for search.
  search_text text generated always as (lower(name_en || ' ' || translate(name_ar, 'أإآٱىة', 'ااااايه'))) stored,
  area text not null default '',
  address text not null default '',
  tel text not null default '',
  website text not null default '',
  instagram text not null default '',
  -- open: shown. closed: confirmed closed (kept so old rankings still resolve). retired: no longer in the import.
  status text not null default 'open' check (status in ('open', 'closed', 'retired')),
  refreshed date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (name_en <> '' or name_ar <> '')
);
create index places_location_idx on public.places using gist (location);

-- A place has many categories. `source` keeps the import's guesses apart from what users, owners or a
-- model later add, so a re-import never overwrites them.
create table public.place_categories (
  place_id text not null references public.places on delete cascade,
  category_id text not null references public.categories on update cascade,
  source text not null default 'import' check (source in ('import', 'user', 'owner', 'model')),
  primary key (place_id, category_id, source)
);
create index place_categories_category_idx on public.place_categories (category_id);

-- ---------------------------------------------------------------- people

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  handle text unique check (handle ~ '^[a-z0-9_.]{3,24}$'),
  name text not null default '' check (char_length(name) <= 60),
  bio text not null default '' check (char_length(bio) <= 160),
  area text not null default '',
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

-- Onboarding answers and settings. Private.
create table public.preferences (
  user_id uuid primary key references public.profiles on delete cascade,
  prefs jsonb not null default '{}',
  max_price smallint check (max_price between 1 and 4),
  origin_lat double precision,
  origin_lng double precision,
  origin_label text not null default '',
  updated_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.preferences (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.follows (
  follower_id uuid not null default auth.uid() references public.profiles on delete cascade,
  followee_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id);

-- ---------------------------------------------------------------- rankings

-- One row per ranked place. `position` is 0 for the best place in its band. Written only through
-- set_rankings(), which replaces a user's whole list for one kind in a single transaction.
create table public.rankings (
  user_id uuid not null references public.profiles on delete cascade,
  place_id text not null references public.places,
  kind text not null check (kind in ('cafe', 'restaurant')),
  reaction text not null check (reaction in ('loved', 'fine', 'disliked')),
  position integer not null check (position >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, place_id),
  unique (user_id, kind, reaction, position)
);
create index rankings_place_idx on public.rankings (place_id);

-- Same arithmetic as bandScore() in src/reco/ranking.ts, in double precision and in the same order, so
-- the app and the database agree to the decimal. floor(x + 0.5) is JavaScript's Math.round.
create view public.ranking_scores with (security_invoker = true) as
select
  r.user_id, r.place_id, r.kind, r.reaction, r.position,
  floor((b.hi - (r.position * (b.hi - b.lo)) / count(*) over (partition by r.user_id, r.kind, r.reaction)) * 10 + 0.5) / 10
    as score
from public.rankings r
join (values ('loved', 6.7::float8, 10.0::float8), ('fine', 3.4, 6.7), ('disliked', 0.0, 3.4)) as b (reaction, lo, hi)
  using (reaction);

-- Community average per place: the only number about a place the app shows.
create view public.place_stats with (security_invoker = true) as
select place_id, round(avg(score)::numeric, 1) as avg_score, count(*) as ratings
from public.ranking_scores
group by place_id;

-- Places the user has been to but not ranked yet (from onboarding).
create table public.unranked (
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  place_id text not null references public.places,
  reaction text not null check (reaction in ('loved', 'fine', 'disliked')),
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

-- Every comparison answer: "would you rather go back to place_id or other_id?". Training data for
-- personal taste weights. Private.
create table public.comparisons (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  place_id text not null references public.places,
  other_id text not null references public.places,
  answer text not null check (answer in ('new', 'existing', 'tie', 'skip')),
  created_at timestamptz not null default now(),
  check (place_id <> other_id)
);
create index comparisons_user_idx on public.comparisons (user_id, created_at desc);

-- Security definer so it can write rankings, which have no write policies. It only ever touches the
-- caller's own rows (auth.uid()).
create function public.set_rankings(p_kind text, p_entries jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  wrong text;
begin
  if uid is null then
    raise exception 'Sign in to save rankings' using errcode = '28000';
  end if;
  if p_kind not in ('cafe', 'restaurant') then
    raise exception 'Unknown kind %', p_kind using errcode = '22023';
  end if;
  if jsonb_typeof(p_entries) <> 'array' then
    raise exception 'Entries must be a JSON array' using errcode = '22023';
  end if;

  select e->>'place_id' into wrong
  from jsonb_array_elements(p_entries) as e
  left join public.places p on p.id = e->>'place_id'
  where p.id is null or p.kind <> p_kind
  limit 1;
  if found then
    raise exception 'Place % is not a %', wrong, p_kind using errcode = '22023';
  end if;

  delete from public.rankings where user_id = uid and kind = p_kind;
  insert into public.rankings (user_id, place_id, kind, reaction, position)
  select uid, x.e->>'place_id', p_kind, x.e->>'reaction',
         (row_number() over (partition by x.e->>'reaction' order by x.ord) - 1)::int
  from jsonb_array_elements(p_entries) with ordinality as x (e, ord);

  delete from public.unranked u
  using public.rankings r
  where u.user_id = uid and r.user_id = uid and r.place_id = u.place_id;
end $$;

-- ---------------------------------------------------------------- diary, saved, lists

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  place_id text not null references public.places,
  visited_on date not null check (visited_on <= current_date + 1),
  reaction text not null check (reaction in ('loved', 'fine', 'disliked')),
  ordered text[] not null default '{}',
  note text not null default '' check (char_length(note) <= 2000),
  created_at timestamptz not null default now()
);
create index visits_user_idx on public.visits (user_id, visited_on desc);
create index visits_place_idx on public.visits (place_id, created_at desc);

-- Want to go. Private.
create table public.saved (
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  place_id text not null references public.places,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lists_owner_idx on public.lists (owner_id);

create table public.list_items (
  list_id uuid not null references public.lists on delete cascade,
  place_id text not null references public.places,
  position integer not null default 0,
  added_at timestamptz not null default now(),
  primary key (list_id, place_id)
);

-- ---------------------------------------------------------------- signals for the recommender

-- What was shown, where, and in which slot. Lets the engine stop repeating places you ignore. Private.
create table public.impressions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  place_id text not null references public.places,
  surface text not null check (surface in ('for_you', 'search', 'feed', 'list', 'place')),
  slot smallint not null default 0,
  request_id uuid,
  shown_at timestamptz not null default now()
);
create index impressions_user_idx on public.impressions (user_id, shown_at desc);

-- What the user did with a shown place. `dismiss` hides it from recommendations for a while. Private.
create table public.interactions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  place_id text not null references public.places,
  action text not null check (action in ('open', 'directions', 'share', 'dismiss')),
  surface text not null default '' check (char_length(surface) <= 20),
  request_id uuid,
  created_at timestamptz not null default now()
);
create index interactions_user_idx on public.interactions (user_id, created_at desc);

-- "This place has closed" and other corrections. Reviewed by hand. Private to the reporter.
create table public.reports (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  place_id text not null references public.places,
  reason text not null check (reason in ('closed', 'wrong_location', 'duplicate', 'not_food', 'shisha', 'other')),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index reports_open_once on public.reports (user_id, place_id, reason) where resolved_at is null;

-- ---------------------------------------------------------------- reading places

-- Open places within p_km of a point, nearest first, with their categories and community average.
-- The app scores these on the device.
create function public.places_near(
  p_lat double precision,
  p_lng double precision,
  p_km double precision default 5,
  p_kind text default null,
  p_limit integer default 300
)
returns table (
  id text, name_en text, name_ar text, kind text, lat double precision, lng double precision, area text,
  categories text[], km double precision, avg_score numeric, ratings bigint
)
language sql stable security invoker set search_path = '' as $$
  with origin as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as g
  )
  select
    p.id, p.name_en, p.name_ar, p.kind, p.lat, p.lng, p.area,
    coalesce((select array_agg(pc.category_id order by pc.category_id)
              from (select distinct category_id from public.place_categories where place_id = p.id) pc), '{}'),
    extensions.st_distance(p.location, o.g) / 1000,
    s.avg_score,
    coalesce(s.ratings, 0)
  from public.places p
  cross join origin o
  left join public.place_stats s on s.place_id = p.id
  where p.status = 'open'
    and extensions.st_dwithin(p.location, o.g, least(greatest(p_km, 0), 50) * 1000)
    and (p_kind is null or p.kind = p_kind)
  order by p.location operator(extensions.<->) o.g
  limit least(greatest(p_limit, 1), 1000);
$$;

-- Name search in English or Arabic. Names starting with the query come first, then nearer places.
create function public.search_places(
  p_query text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_limit integer default 30
)
returns table (id text, name_en text, name_ar text, kind text, area text, km double precision)
language sql stable security invoker set search_path = '' as $$
  with q as (select lower(translate(trim(p_query), 'أإآٱىة', 'ااااايه')) as t)
  select
    p.id, p.name_en, p.name_ar, p.kind, p.area,
    case when p_lat is null or p_lng is null then null
         else extensions.st_distance(
                p.location,
                extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography) / 1000
    end as km
  from public.places p, q
  where p.status = 'open'
    and char_length(q.t) >= 2
    and strpos(p.search_text, q.t) > 0
  order by
    (lower(p.name_en) like q.t || '%' or translate(p.name_ar, 'أإآٱىة', 'ااااايه') like q.t || '%') desc,
    km asc nulls last,
    p.name_en
  limit least(greatest(p_limit, 1), 100);
$$;

-- ---------------------------------------------------------------- row-level security

alter table public.categories enable row level security;
alter table public.places enable row level security;
alter table public.place_categories enable row level security;
alter table public.profiles enable row level security;
alter table public.preferences enable row level security;
alter table public.follows enable row level security;
alter table public.rankings enable row level security;
alter table public.unranked enable row level security;
alter table public.comparisons enable row level security;
alter table public.visits enable row level security;
alter table public.saved enable row level security;
alter table public.lists enable row level security;
alter table public.list_items enable row level security;
alter table public.impressions enable row level security;
alter table public.interactions enable row level security;
alter table public.reports enable row level security;

-- Catalogue: readable by everyone, written only by the loader (service role bypasses RLS).
create policy "catalogue is public" on public.categories for select to anon, authenticated using (true);
create policy "catalogue is public" on public.places for select to anon, authenticated using (true);
create policy "catalogue is public" on public.place_categories for select to anon, authenticated using (true);

-- Shown to other signed-in people; changed only by the owner.
create policy "signed-in people can read" on public.profiles for select to authenticated using (true);
create policy "you edit your profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "signed-in people can read" on public.follows for select to authenticated using (true);
create policy "you follow" on public.follows for insert to authenticated with check (follower_id = (select auth.uid()));
create policy "you unfollow" on public.follows for delete to authenticated using (follower_id = (select auth.uid()));

-- No write policies: rankings change only through set_rankings(), which keeps positions gap-free.
create policy "signed-in people can read" on public.rankings for select to authenticated using (true);

create policy "signed-in people can read" on public.visits for select to authenticated using (true);
create policy "you log visits" on public.visits for insert to authenticated with check (user_id = (select auth.uid()));
create policy "you edit visits" on public.visits for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "you delete visits" on public.visits for delete to authenticated using (user_id = (select auth.uid()));

create policy "signed-in people can read" on public.lists for select to authenticated using (true);
create policy "you make lists" on public.lists for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "you edit lists" on public.lists for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "you delete lists" on public.lists for delete to authenticated using (owner_id = (select auth.uid()));

create policy "signed-in people can read" on public.list_items for select to authenticated using (true);
create policy "you fill your lists" on public.list_items for all to authenticated
  using (exists (select 1 from public.lists l where l.id = list_id and l.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.lists l where l.id = list_id and l.owner_id = (select auth.uid())));

-- Private: only you, for everything.
create policy "only you" on public.preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "only you" on public.unranked for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "only you" on public.saved for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Private and append-only: you add and read your own; nobody edits history.
create policy "you read yours" on public.comparisons for select to authenticated using (user_id = (select auth.uid()));
create policy "you add yours" on public.comparisons for insert to authenticated with check (user_id = (select auth.uid()));
create policy "you read yours" on public.impressions for select to authenticated using (user_id = (select auth.uid()));
create policy "you add yours" on public.impressions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "you read yours" on public.interactions for select to authenticated using (user_id = (select auth.uid()));
create policy "you add yours" on public.interactions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "you read yours" on public.reports for select to authenticated using (user_id = (select auth.uid()));
create policy "you add yours" on public.reports for insert to authenticated with check (user_id = (select auth.uid()));

revoke execute on function public.set_rankings(text, jsonb) from public, anon;
grant execute on function public.set_rankings(text, jsonb) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

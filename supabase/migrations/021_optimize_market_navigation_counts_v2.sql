-- Replace the regex-heavy count function with lightweight title matching.
-- This keeps exact aggregate counts while avoiding long page requests.
create or replace function public.get_market_navigation_counts()
returns jsonb
language sql
security definer
set search_path = public
as $$
with active as (
  select lower(coalesce(title,'')) as text, lower(coalesce(category,'')) as category
  from public.events where status='active'
), main as (
  select jsonb_build_object(
    'All',count(*),'Politics',count(*) filter(where category='politics'),'Sports',count(*) filter(where category='sports'),'Crypto',count(*) filter(where category='crypto'),'Finance',count(*) filter(where category='finance'),'Tech',count(*) filter(where category='tech'),'Culture',count(*) filter(where category='entertainment'),
    'Economy',count(*) filter(where category in('finance','business') or text like any(array['%economy%','%economic%','%inflation%','%gdp%','%unemployment%','%jobs report%','%interest rate%','%recession%'])),
    'Esports',count(*) filter(where text like any(array['%esports%','%esport%','%league of legends%','%counter-strike%','%cs2%','%dota%','%valorant%'])),
    'Iran',count(*) filter(where text like any(array['%iran%','%iranian%'])),'Geopolitics',count(*) filter(where category='world' or text like any(array['%geopolitic%','%international relations%'])),
    'Weather',count(*) filter(where text like any(array['%weather%','%temperature%','%forecast%','%hurricane%','%storm%','%rainfall%','%snowfall%','%degrees%'])),
    'Mentions',count(*) filter(where text like any(array['%tweet%','%tweets%','%x post%','%twitter%','%mention%','%mentions%'])),
    'Elections',count(*) filter(where text like any(array['%election%','%elections%','%primary%','%primaries%','%midterm%','%midterms%','%ballot%','%vote%','%voting%'])),
    'Art',count(*) filter(where text like any(array['%art%','%artist%','%artwork%','%painting%','%museum%','%sculpture%']))
  ) value from active
), topics as (
  select jsonb_build_object(
    'Trump',count(*) filter(where text like '%trump%'),'Laptop',count(*) filter(where text like '%laptop%'),'NFL Gameday',count(*) filter(where text like '%nfl%'),'UCL Matchday',count(*) filter(where text like any(array['%ucl%','%champions league%'])),
    'AI Achievements',count(*) filter(where text like any(array['%ai%','%artificial intelligence%','%chatgpt%','%gpt%','%claude%','%gemini%'])),'Sweden Elections',count(*) filter(where text like any(array['%sweden%','%swedish%'])),'Astra',count(*) filter(where text like '%astra%'),'GTA VI',count(*) filter(where text like any(array['%gta vi%','%gta 6%','%grand theft auto vi%'])),
    'Fed',count(*) filter(where text like any(array['%federal reserve%','%fed%','%interest rate%'])),'Iran',count(*) filter(where text like any(array['%iran%','%iranian%'])),'September 8 and 9 Primaries',count(*) filter(where text like any(array['%september 8%','%september 9%','%sep 8%','%sep 9%','%primary%','%primaries%'])),'US Open',count(*) filter(where text like '%us open%'),
    'US Canada Trade War',count(*) filter(where text like any(array['%us-canada%','%us canada%','%canada trade%','%trade war%'])),'Russia',count(*) filter(where text like any(array['%russia%','%russian%'])),'Emmys',count(*) filter(where text like any(array['%emmy%','%emmys%'])),'Lower Saxony',count(*) filter(where text like any(array['%lower saxony%','%niedersachsen%'])),
    'Anthropic IPO',count(*) filter(where text like any(array['%anthropic%','%anthropic ipo%'])),'Gaza',count(*) filter(where text like '%gaza%'),'Berlin',count(*) filter(where text like '%berlin%'),'Mecklenburg-Vorpommern',count(*) filter(where text like '%mecklenburg-vorpommern%'),'Saxony-Anhalt',count(*) filter(where text like '%saxony-anhalt%'),
    'Israel Election',count(*) filter(where text like any(array['%israel election%','%israeli election%'])),'Oil',count(*) filter(where text like any(array['%oil%','%crude oil%','%brent%','%wti%'])),'AI',count(*) filter(where text like any(array['%ai%','%artificial intelligence%'])),'Earnings',count(*) filter(where text like any(array['%earnings%','%revenue%','%profit%','%quarterly results%'])),
    'Tweet Markets',count(*) filter(where text like any(array['%tweet%','%tweets%','%x post%','%twitter%'])),'Daily Temperature',count(*) filter(where text like any(array['%temperature%','%degrees%','%daily temperature%'])),'Cuba',count(*) filter(where text like any(array['%cuba%','%cuban%'])),'Peace Deal',count(*) filter(where text like any(array['%peace deal%','%peace agreement%','%ceasefire%'])),
    'Privates',count(*) filter(where text like any(array['%private company%','%private market%','%private valuation%','%privates%'])),'Strait of Hormuz',count(*) filter(where text like any(array['%strait of hormuz%','%hormuz%'])),'Global Elections',count(*) filter(where text like any(array['%global election%','%world election%','%elections%'])),'Midterms',count(*) filter(where text like any(array['%midterm%','%midterms%'])),
    'Movies',count(*) filter(where text like any(array['%movie%','%movies%','%film%','%box office%'])),'Crypto Prices',count(*) filter(where text like any(array['%bitcoin%','%btc%','%ethereum%','%eth%','%solana%','%crypto%','%dogecoin%','%xrp%','%bnb%'])),'Commodities',count(*) filter(where text like any(array['%commodity%','%commodities%','%gold%','%silver%','%copper%']))
  ) value from active
)
select jsonb_build_object('main',main.value,'topics',topics.value) from main,topics;
$$;
grant execute on function public.get_market_navigation_counts() to anon, authenticated;
select pg_notify('pgrst','reload schema');

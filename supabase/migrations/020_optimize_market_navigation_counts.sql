create or replace function public.get_market_navigation_counts()
returns jsonb
language sql
security definer
set search_path = public
as $$
with active as materialized (
  select lower(coalesce(title,'') || ' ' || coalesce(description,'')) as text, lower(coalesce(category,'')) as category
  from public.events where status = 'active'
), counts as (
  select jsonb_build_object(
    'All', count(*),
    'Politics', count(*) filter (where category='politics'),
    'Sports', count(*) filter (where category='sports'),
    'Crypto', count(*) filter (where category='crypto'),
    'Finance', count(*) filter (where category='finance'),
    'Tech', count(*) filter (where category='tech'),
    'Culture', count(*) filter (where category='entertainment'),
    'Economy', count(*) filter (where category in ('finance','business') or text ~ '(economy|economic|inflation|gdp|unemployment|jobs report|interest rate|recession)'),
    'Esports', count(*) filter (where text ~ '(esports|esport|league of legends|counter-strike|cs2|dota|valorant)'),
    'Iran', count(*) filter (where text ~ '(iran|iranian)'),
    'Geopolitics', count(*) filter (where category='world' or text ~ '(geopolitic|international relations)'),
    'Weather', count(*) filter (where text ~ '(weather|temperature|forecast|hurricane|storm|rainfall|snowfall|degrees)'),
    'Mentions', count(*) filter (where text ~ '(tweet|tweets|x post|twitter|mention|mentions)'),
    'Elections', count(*) filter (where text ~ '(election|elections|primary|primaries|midterm|midterms|ballot|vote|voting)'),
    'Art', count(*) filter (where text ~ '(art|artist|artwork|painting|museum|sculpture)')
  ) main from active
), topics as (
  select jsonb_build_object(
    'Trump',count(*) filter(where text~'trump'),'Laptop',count(*) filter(where text~'laptop'),'NFL Gameday',count(*) filter(where text~'nfl'),'UCL Matchday',count(*) filter(where text~'(ucl|champions league)'),
    'AI Achievements',count(*) filter(where text~'(ai|artificial intelligence|chatgpt|gpt|claude|gemini)'),'Sweden Elections',count(*) filter(where text~'(sweden|swedish)'),'Astra',count(*) filter(where text~'astra'),'GTA VI',count(*) filter(where text~'(gta vi|gta 6|grand theft auto vi)'),
    'Fed',count(*) filter(where text~'(federal reserve|fed|interest rate)'),'Iran',count(*) filter(where text~'(iran|iranian)'),'September 8 and 9 Primaries',count(*) filter(where text~'(september 8|september 9|sep 8|sep 9|primary|primaries)'),'US Open',count(*) filter(where text~'us open'),
    'US Canada Trade War',count(*) filter(where text~'(us-canada|us canada|canada trade|trade war)'),'Russia',count(*) filter(where text~'(russia|russian)'),'Emmys',count(*) filter(where text~'(emmy|emmys)'),'Lower Saxony',count(*) filter(where text~'(lower saxony|niedersachsen)'),
    'Anthropic IPO',count(*) filter(where text~'(anthropic|anthropic ipo)'),'Gaza',count(*) filter(where text~'gaza'),'Berlin',count(*) filter(where text~'berlin'),'Mecklenburg-Vorpommern',count(*) filter(where text~'mecklenburg-vorpommern'),'Saxony-Anhalt',count(*) filter(where text~'saxony-anhalt'),
    'Israel Election',count(*) filter(where text~'(israel election|israeli election)'),'Oil',count(*) filter(where text~'(oil|crude oil|brent|wti)'),'AI',count(*) filter(where text~'(ai|artificial intelligence)'),'Earnings',count(*) filter(where text~'(earnings|revenue|profit|quarterly results)'),
    'Tweet Markets',count(*) filter(where text~'(tweet|tweets|x post|twitter)'),'Daily Temperature',count(*) filter(where text~'(temperature|degrees|daily temperature)'),'Cuba',count(*) filter(where text~'(cuba|cuban)'),'Peace Deal',count(*) filter(where text~'(peace deal|peace agreement|ceasefire)'),
    'Privates',count(*) filter(where text~'(private company|private market|private valuation|privates)'),'Strait of Hormuz',count(*) filter(where text~'(strait of hormuz|hormuz)'),'Global Elections',count(*) filter(where text~'(global election|world election|elections)'),'Midterms',count(*) filter(where text~'(midterm|midterms)'),
    'Movies',count(*) filter(where text~'(movie|movies|film|box office)'),'Crypto Prices',count(*) filter(where text~'(bitcoin|btc|ethereum|eth|solana|crypto|dogecoin|xrp|bnb)'),'Commodities',count(*) filter(where text~'(commodity|commodities|gold|silver|copper)')
  ) topics from active
)
select jsonb_build_object('main',counts.main,'topics',topics.topics) from counts,topics;
$$;
grant execute on function public.get_market_navigation_counts() to anon, authenticated;

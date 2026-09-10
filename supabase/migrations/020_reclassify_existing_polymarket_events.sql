-- Reclassify existing Polymarket events that were previously imported as General.
-- Keep already-specific categories untouched and use the same ordered topic rules
-- as the application classifier for a safe one-time cleanup.
UPDATE public.events
SET category = CASE
  WHEN lower(coalesce(title,'') || ' ' || coalesce(description,'')) ~ '\m(nfl|nba|nhl|mlb|ncaa|ufc|mma|fifa|soccer|football|basketball|baseball|tennis|golf|boxing|cricket|formula[[:space:]]*1|f1|racing|match|tournament|league|championship|playoffs?|world series|super bowl|grand prix)\M' THEN 'sports'
  WHEN lower(coalesce(title,'') || ' ' || coalesce(description,'')) ~ '\m(bitcoin|btc|ethereum|eth|solana|sol|crypto|cryptocurrency|blockchain|token|memecoin|dogecoin|xrp|bnb|defi|nft)\M' THEN 'crypto'
  WHEN lower(coalesce(title,'') || ' ' || coalesce(description,'')) ~ '\m(ai|artificial intelligence|openai|chatgpt|google|apple|microsoft|nvidia|meta|robot|robotics|technology|tech|software|chip|semiconductor|spacex|tesla|quantum computing)\M' THEN 'tech'
  WHEN lower(coalesce(title,'') || ' ' || coalesce(description,'')) ~ '\m(movie|film|music|song|album|actor|actress|celebrity|grammy|oscar|emmy|tv|television|netflix|youtube|streaming|entertainment|box office)\M' THEN 'entertainment'
  WHEN lower(coalesce(title,'') || ' ' || coalesce(description,'')) ~ '\m(stock|stocks|nasdaq|s&p|dow jones|fed|federal reserve|interest rate|interest rates|inflation|cpi|gdp|recession|economy|economic|treasury|bond yield|unemployment|jobs report|earnings|revenue|ipo|company)\M' THEN 'finance'
  WHEN lower(coalesce(title,'') || ' ' || coalesce(description,'')) ~ '\m(business|corporate|merger|acquisition|startup|ceo|company launches|retail sales|sales forecast|industry)\M' THEN 'business'
  WHEN lower(coalesce(title,'') || ' ' || coalesce(description,'')) ~ '\m(president|presidential|election|senate|congress|governor|mayor|democrat|republican|vote|voting|government|prime minister|parliament|cabinet|supreme court|political party|legislation|bill passes|referendum)\M' THEN 'politics'
  WHEN lower(coalesce(title,'') || ' ' || coalesce(description,'')) ~ '\m(ukraine|russia|israel|iran|china|taiwan|north korea|south korea|gaza|palestine|nato|united nations|war|warfare|ceasefire|invasion|military conflict|geopolitic|international|global|country)\M' THEN 'world'
  ELSE category
END
WHERE source_platform = 'polymarket'
  AND lower(coalesce(category,'')) = 'general';

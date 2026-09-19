-- 팀 실천약속 핵심 단어 정리 보강
--  · '시작하고'·'공유하며' → '시작'·'공유' (연결어미)
--  · '끝냅니다'·'읽습니다'처럼 명사로 줄일 수 없는 서술어는 집계에서 뺀다 (약속의 '주제'가 아니라 말투이므로)
--  · '바로'·'미리'·'먼저' 같은 부사·의존어는 뺀다
--  · '역할'·'권한'처럼 '할/한'으로 끝나는 명사를 지키기 위해 '~할/~한'은 떼지 않는다
-- 단어 규칙은 이 함수 하나에 모여 있다 — 운영 중 눈에 거슬리는 단어가 보이면 stop 목록에만 추가하면 된다.
create or replace function _word_stem(p text) returns text
language plpgsql immutable as $$
declare
  w text := regexp_replace(p, '[[:punct:]“”‘’·…]', '', 'g');
  s text;
  stop constant text[] := array[
    '바로','미리','먼저','항상','매번','서로','함께','모두','모든','다시','더','꼭','잘','안','못','및','등','것','수','때','그','이','저',
    '전에','후에','안에','동안','그날','당일','끝까지','혼자','위해','대해','통해','위한','대한','관련','경우','있는','없는','않고','않는','하는','하고','하며'];
begin
  -- 서술어 꼬리 → 명사
  s := regexp_replace(w, '(하겠습니다|했습니다|합니다|됩니다|입니다|한다|하기|하고|하며|하여|해서|하도록|하지|하는)$', '');
  if s <> w then
    if char_length(s) >= 2 then w := s; else return ''; end if;
  elsif w ~ '(니다|는다)$' then
    return '';   -- 끝냅니다 · 읽습니다 · 줍니다 …
  end if;
  -- 조사
  s := regexp_replace(w, '(으로|에서|에게|까지|부터|마다|을|를|이|가|은|는|의|에|로|와|과|도)$', '');
  if char_length(s) >= 2 then w := s; end if;
  if w = any(stop) then return ''; end if;
  return w;
end $$;
revoke all on function _word_stem(text) from public, anon, authenticated;

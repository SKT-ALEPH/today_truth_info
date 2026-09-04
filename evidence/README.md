# 실제 공개 원천 보조 기록

서로 다른 실제 KST 날짜에 `오늘 기록 저장`을 성공시킨 뒤 각 DB 행과 원자료를 `live/YYYY-MM-DD.json`으로 내보내 보관한다.

필수 필드:

- `server_created_at`
- `source_url`
- `source_observed_at`
- `normalized_value`
- `unit`
- `raw_payload`
- `raw_sha256`

이 폴더에는 개인정보, 비밀번호, 토큰, DB 연결 문자열 또는 합성 fixture를 실제 기록으로 넣지 않는다. 현재 실제 기록은 0건이며, 날짜를 조작해 미리 만들지 않는다.

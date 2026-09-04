# 오늘의 진짜 정보판

서울 시청 좌표의 Open-Meteo 모델 기반 2m 현재 기온을 조회하고, Asia/Seoul 날짜별로 두 건을 보존하며, 외부 원천 실패를 정직하게 설명하는 Next.js 정보판입니다.

## 로컬 실행

```bash
pnpm install
pnpm dev
```

실제 일별 저장을 사용하려면 Neon Postgres에 `db/schema.sql`을 실행하고 프로젝트 루트의 `.env.local`에 `DATABASE_URL`을 설정합니다. 연결하지 않아도 실제값 미리보기와 합성 장애 재생은 동작합니다.

## 검증

```bash
pnpm lint
pnpm test
pnpm build
node scripts/scan-secrets.mjs
```

정본 조건과 구현 대응은 `RULES.md`, 제출용 문구와 실제 날짜 기록 위치는 `SUBMISSION.md`에서 확인합니다.

## 데이터 경계

- 실제 원천: 비밀키 없는 Open-Meteo HTTPS API
- 실제 기록: 최대 두 개의 서로 다른 KST 날짜, 둘째 기록 뒤 변경 잠금
- 합성 재생: 제공된 공개 T04 fixture 전용
- 개인정보: 계정·사용자 위치·분석기·사용자 입력을 수집하지 않음

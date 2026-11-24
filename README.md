# 근무표 캘린더 (PWA)

서버 없이 동작하는 교대근무 달력입니다. 데이터는 브라우저(localStorage)에 저장됩니다.

## 설치(배포)
정적 파일이라 HTTPS 정적 호스팅(GitHub Pages, Netlify, Cloudflare Pages 등)에 폴더째 올리면 됩니다.
휴대폰에서 주소를 열고:
- Android Chrome: 메뉴 ⋮ → "홈 화면에 추가" / "앱 설치"
- iPhone Safari: 공유 버튼 → "홈 화면에 추가"

로컬 확인: `python3 -m http.server 8000` 후 http://localhost:8000

## 기본 패턴
2026-11-30 주간 시작, 주 → 야 → 비 → 일 순환 (12/1 야간, 12/2 비번, 12/3 일근, 12/4 주간)

## 파일
- index.html / style.css / app.js : 화면과 로직
- holidays.js : 2025~2028 한국 공휴일 (임시공휴일은 앱에서 날짜별로 추가)
- manifest.json / sw.js / icons : PWA 설치·오프라인

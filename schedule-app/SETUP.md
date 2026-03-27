# 🚀 레슨스케줄 앱 — Firebase 설정 가이드

## 📁 파일 구조
```
schedule-app/
├── index.html          ← 메인 앱
├── style.css           ← 전체 스타일
├── app.js              ← 앱 로직
├── firebase-config.js  ← Firebase 설정 (이 파일 수정 필요!)
├── sw.js               ← 서비스워커 (PWA/오프라인)
├── manifest.json       ← PWA 설치 정보
└── SETUP.md            ← 이 파일
```

---

## STEP 1 — Firebase 프로젝트 만들기 (무료)

1. https://console.firebase.google.com 접속
2. **"프로젝트 만들기"** 클릭
3. 프로젝트 이름: `lesson-schedule` (원하는 이름)
4. Google Analytics: **사용 안 함** 선택 → 완료

---

## STEP 2 — 웹 앱 등록 & 설정 복사

1. Firebase Console → ⚙️ 프로젝트 설정
2. **"내 앱"** 섹션 → `</>` (웹) 아이콘 클릭
3. 앱 닉네임: `schedule-pwa` 입력 → **앱 등록**
4. 아래 같은 코드가 나옵니다:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "lesson-schedule.firebaseapp.com",
  projectId: "lesson-schedule",
  storageBucket: "lesson-schedule.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123"
};
```

5. **`firebase-config.js`** 파일을 열어서 `YOUR_API_KEY` 등을 위 값으로 교체

---

## STEP 3 — Authentication 활성화

1. Firebase Console → **Authentication** → **시작하기**
2. **"이메일/비밀번호"** → 사용 설정 **ON** → 저장

### 대표 계정 만들기
1. Authentication → **사용자** 탭 → **사용자 추가**
2. 이메일: `admin@yourschool.com`
3. 비밀번호: (안전한 비밀번호)
4. 추가 후 생성된 **UID** 복사

### Firestore에 대표 프로필 등록
Firebase Console → **Firestore Database** → **컬렉션 시작**
- 컬렉션 ID: `users`
- 문서 ID: (위에서 복사한 UID)
- 필드 추가:
  ```
  name: "홍길동"        (문자열)
  role: "admin"         (문자열)
  email: "admin@..."    (문자열)
  color: "#58a6ff"      (문자열)
  phone: "010-0000-0000"(문자열)
  ```

---

## STEP 4 — Firestore 데이터베이스 생성

1. Firebase Console → **Firestore Database** → **데이터베이스 만들기**
2. **테스트 모드**로 시작 (나중에 보안 규칙 설정)
3. 리전: `asia-northeast3` (서울) 선택

### 보안 규칙 설정 (중요!)
Firestore → **규칙** 탭에 아래 붙여넣기:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 로그인한 사용자만 접근 가능
    function isAuth() {
      return request.auth != null;
    }

    // 관리자 확인
    function isAdmin() {
      return isAuth() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // users 컬렉션
    match /users/{uid} {
      allow read: if isAuth();
      allow write: if isAdmin() || request.auth.uid == uid;
    }

    // students 컬렉션
    match /students/{id} {
      allow read: if isAuth();
      allow write: if isAdmin();
    }

    // lessons 컬렉션
    match /lessons/{id} {
      allow read: if isAuth();
      allow write: if isAdmin() ||
        (isAuth() && request.resource.data.teacherId == request.auth.uid);
    }
  }
}
```

---

## STEP 5 — 선생님 계정 만들기

Firebase Authentication은 Admin SDK 없이 일반 사용자가
다른 계정을 만들 수 없습니다. 아래 방법으로 만드세요:

### 방법 A — Firebase Console에서 직접 생성 (권장)
1. Authentication → 사용자 → **사용자 추가**
2. 이메일/비밀번호 입력 → 사용자 추가
3. 생성된 **UID 복사**
4. Firestore → `users` 컬렉션 → 새 문서 (ID = UID):
   ```
   name: "선생님이름"
   role: "teacher"
   email: "teacher@email.com"
   phone: "010-0000-0000"
   color: "#f0984a"
   ```

### 방법 B — 앱 내 선생님 관리 페이지 사용
앱의 **선생님 관리** 페이지에서 추가하면 Firestore에는 저장되지만,
실제 로그인 계정은 방법 A처럼 별도로 만들어야 합니다.

---

## STEP 6 — 앱 배포 (무료 호스팅)

### Firebase Hosting 사용 (권장, 무료)
```bash
# Node.js 설치 후
npm install -g firebase-tools
firebase login
cd schedule-app
firebase init hosting
# public 디렉토리: . (현재 폴더)
firebase deploy
```
→ `https://프로젝트ID.web.app` 주소로 접속 가능

### 기타 무료 호스팅 옵션
- **Netlify**: netlify.com → drag & drop 폴더 업로드
- **GitHub Pages**: 깃헙 저장소 → Settings → Pages

---

## STEP 7 — 홈 화면에 앱 설치

배포 후 스마트폰에서 접속:

**Android (Chrome)**
→ 주소창 오른쪽 메뉴 (⋮) → "홈 화면에 추가"

**iPhone (Safari)**
→ 하단 공유 버튼 → "홈 화면에 추가"

---

## 💰 비용

| 서비스 | 무료 한도 | 예상 사용량 |
|--------|-----------|-------------|
| Firestore 읽기 | 50,000회/일 | ✅ 충분 |
| Firestore 쓰기 | 20,000회/일 | ✅ 충분 |
| Firebase Hosting | 10GB/월 | ✅ 충분 |
| Authentication | 무제한 | ✅ 무료 |
| **총 비용** | **$0/월** | 소규모 운영 |

---

## 📞 문의
앱 관련 문의는 개발자에게 연락하세요.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentDeleted } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

exports.createTeacherAccount = onCall(async (request) => {
  // 인증(Authentication) 검증: 로그인이 되어있는가?
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인된 사용자만 접근할 수 있습니다.");
  }
  // 인가(Authorization) 검증: 관리자(admin) 권한인가?
  // 클라이언트의 me.role을 믿지 않고, 서버에서 직접 Firestore를 조회해 교차 검증합니다.
  const callerUid = request.auth.uid;
  const callerDoc = await admin.firestore().collection("users").doc(callerUid).get();
  
  if (!callerDoc.exists || callerDoc.data().role !== "admin") {
    throw new HttpsError("permission-denied", "관리자 권한이 없습니다. 비정상적인 접근입니다.");
  }

  // v2 onCall에서는 페이로드가 request.data 에 바로 담깁니다. (req.body.data 아님)
  const { email, password, name, color, phone, memo } = request.data || {};

  if (!email || !password) {
    throw new HttpsError("invalid-argument", "필수 정보(이메일, 비밀번호)가 누락되었습니다.");
  }

  try {
    // 1. Auth 계정 생성
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: name,
    });

    // 2. Firestore 정보 저장
    await admin.firestore().collection("users").doc(userRecord.uid).set({
      name,
      email,
      role: "teacher",
      color,
      phone: phone || "", // 추가
      memo: memo || "",   // 추가
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { status: "success", uid: userRecord.uid };
  } catch (error) {
    console.error("Error creating user:", error);
  
    // 이메일 중복 등 Firebase Auth 자체 에러 처리
    if (error.code === 'auth/email-already-exists') {
      throw new HttpsError("already-exists", "이미 사용 중인 이메일입니다.");
    }

    throw new HttpsError("internal", error.message);
  }
});

exports.sendCustomResetEmail = onCall({ 
  cors: true,
  secrets: ["GMAIL_PASS"] }, async (request) => {
  // onCall에서는 req.body.data가 아니라 request.data로 바로 접근합니다.
  const { email } = request.data || {};

  if (!email) {
    // 에러를 던질 때도 HttpsError를 사용하는 것이 좋습니다. (선택사항)
    throw new Error("이메일 정보가 누락되었습니다.");
  }

  // Gmail 발송 설정
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "crona.yc@gmail.com", 
      pass: process.env.GMAIL_PASS // 2단계 인증 후 발급받은 앱 비밀번호
    }
  });

  try {
    const link = await admin.auth().generatePasswordResetLink(email);

    const mailOptions = {
      from: '"VOV PILATES" <crona.yc@gmail.com>',
      to: email,
      subject: "[보브필라테스] 비밀번호 재설정 안내입니다",
      html: `
        <div style="font-family: 'Apple SD Gothic Neo', sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eee;">
          <h2 style="color: #58a6ff;">비밀번호 재설정</h2>
          <p>안녕하세요. 레슨 스케줄러 관리자 최영진입니다.</p>
          <p>비밀번호를 재설정하려면 아래 버튼을 클릭하세요. 링크는 1시간 동안 유효합니다.</p>
          <a href="${link}" style="display: block; background: #58a6ff; color: white; padding: 12px; text-align: center; text-decoration: none; border-radius: 5px; margin: 20px 0;">비밀번호 변경하기</a>
          <p style="font-size: 0.8em; color: #888;">본인이 요청하지 않았다면 이 메일을 무시해 주세요.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    
    // 성공 시에는 res.json() 대신 단순히 객체를 return 하면 됩니다.
    return { status: "success" }; 

  } catch (error) {
    console.error("Mail Error:", error);
    // 에러 발생 시 에러를 던집니다.
    throw new Error(error.message);
  }
});

// Firestore 트리거: users 컬렉션의 문서가 삭제될 때 실행
exports.onUserDeleted = onDocumentDeleted("users/{uid}", async (event) => {
  // snapshot 인자를 나열하지 않고 event.params에서 바로 uid를 가져옵니다.
  const uid = event.params.uid;

  console.log(`Firestore 문서 삭제 감지됨. Auth 계정 삭제 시작: ${uid}`);

  try {
    // Firebase Authentication에서 해당 UID의 사용자 삭제
    await admin.auth().deleteUser(uid);
    console.log(`Successfully deleted auth user: ${uid}`);
  } catch (error) {
    // 이미 계정이 지워졌거나 없는 경우에 대한 예외 처리
    if (error.code === 'auth/user-not-found') {
      console.log('User already deleted from Auth or does not exist.');
    } else {
      console.error('Error deleting auth user:', error);
    }
  }
});
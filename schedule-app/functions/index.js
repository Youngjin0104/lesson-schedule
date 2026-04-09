const { onRequest, onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

exports.createTeacherAccount = onRequest({ cors: true }, async (req, res) => {
  // Cloud Functions v2 호출 시 데이터는 req.body.data에 들어있습니다.
  const { email, password, name, color, phone, memo } = req.body.data || {};

  if (!email || !password) {
    return res.status(400).json({ data: { status: "error", message: "필수 정보가 누락되었습니다." } });
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

    // 성공 응답 (반드시 data 객체로 감싸서 반환)
    res.json({ data: { status: "success", uid: userRecord.uid } });
  } catch (error) {
    console.error("Error creating user:", error);
    let message = error.message;
  
    // 이메일 중복 에러 처리
    if (error.code === 'auth/email-already-exists') {
      message = "이미 등록된 이메일 주소입니다.";
    }

    res.status(500).json({ data: { status: "error", message: error.message } });
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
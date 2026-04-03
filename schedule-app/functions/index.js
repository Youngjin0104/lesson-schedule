const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

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